'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');

const input='function hidden(){const privateLocal=17;return privateLocal+getExternal();}'+
  'function publicReader(){return hidden();}module.exports=publicReader;';

/** @param {string} source @returns {()=>unknown} */
function load(source) {
  const context={module:{exports:null},Error,
    getExternal:Function('throw new Error("external callback rejected")')};
  vm.runInNewContext(source,context,{timeout:2000});
  return /** @type {()=>unknown} */(context.module.exports);
}

/** @param {()=>unknown} fn @returns {{source:string,frames:number}} */
function readHiddenFrame(fn) {
  const original=Object.getOwnPropertyDescriptor(Error,'prepareStackTrace');
  let frames=0;
  try {
    Error.prepareStackTrace=(_error,stack)=>{
      frames=stack.length;
      const hidden=stack.map(item=>item.getFunction()).
        find(value=>typeof value==='function' && value.name==='hidden');
      return typeof hidden==='function'?
        Function.prototype.toString.call(hidden):'NO_CALLABLE_FRAME';
    };
    try {fn();}catch(error){
      assert.ok(error instanceof Error);
      return {source:String(error.stack),frames};
    }
    throw Error('Expected private helper to throw');
  }finally{
    if(original)Object.defineProperty(Error,'prepareStackTrace',original);
    else delete Error.prepareStackTrace;
  }
}

test('an external V8 stack hook can observe source of a direct-call-only private function',()=>{
  const native=readHiddenFrame(load(input));
  /** @type {{mode:string,source:string,frames:number,bindings:number}[]} */
  const rows=[];
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const out=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:input}],{
      mode,seed:'agent38-v8-stack-source-escape/'+mode,
      properties:false,strings:false,identifiers:true
    }).files[0];
    const actual=readHiddenFrame(load(String(out.code)));
    rows.push({mode,source:actual.source,frames:actual.frames,
      bindings:out.metrics.bindings});
  }
  console.log('V8_STACK_FUNCTION_SOURCE_ESCAPE '+JSON.stringify({native,rows}));
  assert.deepEqual(rows.filter(row=>row.source!==native.source).map(row=>row.mode),[],
    'An uninstrumented private direct-call should preserve caller-observable V8 stack function source');
});
