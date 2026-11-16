'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @returns {string} */
function execute(code) {
  const context={require,module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} body @returns {string} */
function fixture(body) {
  return "'use strict';const hidden={secretField:17};"+
    "function inspect(){const marker='opaque-literal';return hidden.secretField+marker.length;}"+
    "let observed;try{"+body+"}catch(error){observed=error.message}"+
    "module.exports={value:inspect(),observed};";
}

for(const [name,body] of [
  ['direct Serializer','const writer=new (require("node:v8").Serializer)();writer.writeHeader();writer.writeValue(inspect);'],
  ['direct DefaultSerializer','const writer=new (require("node:v8").DefaultSerializer)();writer.writeHeader();writer.writeValue(inspect);'],
  ['module alias','const v8=require("node:v8");const writer=new v8.Serializer();writer.writeHeader();writer.writeValue(inspect);'],
  ['destructured constructor','const {Serializer:Writer}=require("node:v8");const writer=new Writer();writer.writeHeader();writer.writeValue(inspect);'],
  ['method bind','const v8=require("node:v8");const writer=new v8.Serializer();writer.writeHeader();const send=writer.writeValue.bind(writer);send(inspect);'],
  ['method call','const writer=new (require("node:v8").Serializer)();writer.writeHeader();writer.writeValue.call(writer,inspect);'],
  ['Reflect.apply','const writer=new (require("node:v8").Serializer)();writer.writeHeader();Reflect.apply(writer.writeValue,writer,[inspect]);']
]) {
  test('V8 Serializer.writeValue source error: '+name,()=>{
    const source=fixture(body);
    const original=execute(source);
    assert.match(original,/function inspect\(\)/);
    const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:source}],{
      mode:'sno',seed:'v8-write-value/'+name,strings:true
    }).files[0];
    assert.equal(execute(output.code),original);
    assert.equal(output.metrics.properties,0);
    assert.equal(output.metrics.bindings,0);
    assert.equal(output.metrics.literals,0);
  });
}

test('V8 Serializer.writeValue observes source across CommonJS files',()=>{
  const files=[
    {path:'original.cjs',sourceType:'commonjs',
      code:"function inspect(){const hidden={secretField:19};return hidden.secretField;}module.exports=inspect;"},
    {path:'observer.cjs',sourceType:'commonjs',
      code:"const writer=new (require('node:v8').Serializer)();writer.writeHeader();"+
        "let message;try{writer.writeValue(require('./original.cjs'))}catch(error){message=error.message}module.exports=message;"}
  ];
  const emitted=obfuscateFiles(files,{mode:'sno',seed:'cross-v8-write',strings:true});
  assert.equal(emitted.files[0].code,files[0].code);
  assert.equal(emitted.files[1].code,files[1].code);
});

test('V8 Serializer.writeValue with primitive preserves private-field rename',()=>{
  const source="'use strict';const hidden={secretField:17};"+
    "const writer=new (require('node:v8').Serializer)();writer.writeHeader();"+
    "writer.writeValue(17);module.exports=hidden.secretField;";
  const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'v8-write-positive',strings:false
  }).files[0];
  assert.equal(execute(output.code),execute(source));
  assert.equal(output.metrics.properties,1);
});

test('V8 Serializer source observation recognizes direct instances and ESM constructor imports',()=>{
  assert.equal(observesFunctionSource(parse(
    "const {Serializer}=require('node:v8');const w=new Serializer;w.writeValue(fn)",'commonjs')),true);
  assert.equal(observesFunctionSource(parse(
    "import {DefaultSerializer as Writer} from 'node:v8';const w=new Writer;w.writeValue(fn)",'module')),true);
  assert.equal(observesFunctionSource(parse(
    "import {serialize as encode} from 'node:v8';encode(fn)",'module')),true);
  assert.equal(observesFunctionSource(parse(
    "const w=new (require('node:v8').Serializer)();w.writeValue(42)",'commonjs')),false);
});
