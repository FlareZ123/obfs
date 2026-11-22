'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @typedef {'coo'|'sno'} Mode */

/**
 * @param {string} source
 * @param {Mode} mode
 * @returns {{code:string,properties:number}}
 */
function compile(source,mode){
  const result=obfuscateFiles([{path:'scope.cjs',code:source,
    sourceType:'commonjs'}],{mode,closedWorld:true,
    seed:'private-class-escape-proof/'+mode,
    properties:true,identifiers:false,strings:false});
  const output=result.files[0];
  return {code:/** @type {string} */ (output.code),
    properties:output.metrics.properties};
}

/**
 * @param {string} code
 * @returns {unknown}
 */
function execute(code){
  const context={module:{exports:/** @type {unknown} */ (null)}};
  vm.runInNewContext(code,context,{filename:'scope.cjs',timeout:2000});
  return context.module.exports;
}

const primitive=[
  "const owner={privateField:7};",
  "class Reader{read(){return owner.privateField;}}",
  "const reader=new Reader();"
].join('');

for(const mode of /** @type {Mode[]} */ (['coo','sno'])){
  test(mode+' direct-only private class has an eligible local field',()=>{
    const code=primitive+'module.exports=reader.read();';
    const result=compile(code,mode);
    assert.ok(result.properties>0,result.code);
    assert.equal(execute(code),7);
    assert.equal(execute(result.code),7);
  });

  test(mode+' exported instance exposes native class method source',()=>{
    const code=primitive+'module.exports=reader;';
    const result=compile(code,mode);
    assert.equal(result.properties,0,result.code);
    const native=/** @type {{read:()=>number}} */ (execute(code));
    const actual=/** @type {{read:()=>number}} */ (execute(result.code));
    assert.equal(actual.read(),native.read());
    assert.equal(Object.getPrototypeOf(actual).read.toString(),
      Object.getPrototypeOf(native).read.toString());
  });

  test(mode+' directly exported class exposes native method source',()=>{
    const code=primitive+'module.exports=Reader;';
    const result=compile(code,mode);
    assert.equal(result.properties,0,result.code);
    const native=/** @type {new()=>{read:()=>number}} */ (execute(code));
    const actual=/** @type {new()=>{read:()=>number}} */ (execute(result.code));
    assert.equal(new actual().read(),new native().read());
    assert.equal(actual.prototype.read.toString(),native.prototype.read.toString());
  });

  test(mode+' a method function escaping from the instance retains source',()=>{
    const code=primitive+'module.exports=reader.read;';
    const result=compile(code,mode);
    assert.equal(result.properties,0,result.code);
    const native=/** @type {()=>number} */ (execute(code));
    const actual=/** @type {()=>number} */ (execute(result.code));
    assert.equal(actual(),native());
    assert.equal(actual.toString(),native.toString());
  });

  test(mode+' source-inspected local method is ineligible',()=>{
    const code=primitive+'module.exports=reader.read.toString();';
    const result=compile(code,mode);
    assert.equal(result.properties,0,result.code);
    assert.equal(execute(result.code),execute(code));
  });

  test(mode+' direct eval can discover private class method source',()=>{
    const code=primitive+'module.exports=eval("reader.read.toString()");';
    const result=compile(code,mode);
    assert.equal(result.properties,0,result.code);
    assert.equal(execute(result.code),execute(code));
  });

  test(mode+' returning callable owner data refuses function-source edits',()=>{
    const code=[
      'const owner={privateField:function secret(){return 7;}};',
      'class Reader{read(){return owner.privateField;}}',
      'const reader=new Reader();module.exports=reader.read();'
    ].join('');
    const result=compile(code,mode);
    assert.equal(result.properties,0,result.code);
    const native=/** @type {()=>number} */ (execute(code));
    const actual=/** @type {()=>number} */ (execute(result.code));
    assert.equal(actual(),native());
    assert.equal(actual.toString(),native.toString());
  });

  test(mode+' owner initialization after call must remain source-preserving',()=>{
    const code=[
      'class Reader{read(){return owner.privateField;}}',
      'const reader=new Reader();',
      'module.exports=reader.read();',
      'const owner={privateField:7};'
    ].join('');
    const result=compile(code,mode);
    assert.equal(result.properties,0,result.code);
  });
}
