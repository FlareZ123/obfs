'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Node 22 exposes TextEncoder as a built-in global. Its encode() method
 * converts a function argument to the actual source text of that function.
 * Give each input an independent realm and compare JSON byte sequences.
 *
 * @param {string} code
 * @returns {string}
 */
function execute(code) {
  const context=vm.createContext({TextEncoder,module:{exports:null}});
  vm.runInContext(code,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

const functionSource=
  "function observed(){return 'webidl-factory-observed-source';}\n";
const cases={
  direct:"const encoder=new TextEncoder();\n"+
    functionSource+"module.exports=Array.from(encoder.encode(observed));\n",
  factory:"function make(){return new TextEncoder();}\n"+
    "const encoder=make();\n"+
    functionSource+"module.exports=Array.from(encoder.encode(observed));\n",
  identity:"function identity(value){return value;}\n"+
    "const encoder=identity(new TextEncoder());\n"+
    functionSource+"module.exports=Array.from(encoder.encode(observed));\n",
  returnedField:"function make(){return {coder:new TextEncoder()};}\n"+
    "const encoder=make().coder;\n"+
    functionSource+"module.exports=Array.from(encoder.encode(observed));\n",
  returnedArray:"function make(){return [new TextEncoder()];}\n"+
    "const [encoder]=make();\n"+
    functionSource+"module.exports=Array.from(encoder.encode(observed));\n",
  conditional:"const encoder=true?new TextEncoder():new TextEncoder();\n"+
    functionSource+"module.exports=Array.from(encoder.encode(observed));\n",
  destructureRecord:"const {encoder}={encoder:new TextEncoder()};\n"+
    functionSource+"module.exports=Array.from(encoder.encode(observed));\n",
  destructureReturnedRecord:"function make(){return {encoder:new TextEncoder()};}\n"+
    "const {encoder}=make();\n"+
    functionSource+"module.exports=Array.from(encoder.encode(observed));\n",
  generatorYield:"function* make(){yield new TextEncoder();}\n"+
    "const encoder=make().next().value;\n"+
    functionSource+"module.exports=Array.from(encoder.encode(observed));\n",
  generatorReturn:"function* make(){return new TextEncoder();}\n"+
    "const encoder=make().next().value;\n"+
    functionSource+"module.exports=Array.from(encoder.encode(observed));\n",
  arrayAt:"const encoder=[new TextEncoder()].at(0);\n"+
    functionSource+"module.exports=Array.from(encoder.encode(observed));\n",
  forOf:"for(const encoder of [new TextEncoder()]){\n"+
    functionSource+"module.exports=Array.from(encoder.encode(observed));}\n",
  assignedArray:"let encoder;[encoder]=[new TextEncoder()];\n"+
    functionSource+"module.exports=Array.from(encoder.encode(observed));\n"
};

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test('TextEncoder primitive value still rewrites with native parity: '+mode,()=>{
    const source="const e=new TextEncoder();"+
      "module.exports=Array.from(e.encode('webidl-benign-primitive'));";
    const out=obfuscateFiles([{path:'benign.cjs',sourceType:'commonjs',code:source}],
      {mode,seed:'textencoder-benign/'+mode,
       strings:true,identifiers:false,properties:false}).files[0];
    assert.ok(out.metrics.literals>0,'Safe primitive input must retain string rewrite yield');
    assert.equal(execute(String(out.code)),execute(source));
  });
  for(const [kind,source] of Object.entries(cases)) {
    test('TextEncoder native source coercion via '+kind+' in '+mode,()=>{
      const out=obfuscateFiles([{path:'observer.cjs',sourceType:'commonjs',code:source}],
        {mode,seed:'textencoder-factory/'+kind+'/'+mode,
         strings:true,identifiers:false,properties:false}).files[0];
      assert.equal(execute(String(out.code)),execute(source),
        'Native TextEncoder must encode the same function source bytes');
    });
  }
}
