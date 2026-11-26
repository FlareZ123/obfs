'use strict';

const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');
const {captureSourceFrame}=require('./websocket-source-coercion-probe');

/**
 * A classic-script group can share a WebSocket reference through the actual
 * page global, even when no one input file alone proves both constructor
 * provenance and the later native send method.
 * @param {boolean} primitive
 * @returns {Promise<void>}
 */
async function compare(primitive){
  /** @type {import('../src/core').SourceFile[]} */
  const files=[
    {path:'first.js',sourceType:'script',code:
      'globalThis.__transport=new WebSocket(globalThis.__url);'},
    {path:'second.js',sourceType:'script',code:[
      'function protocolSensitive(){return "value-723";}',
      'globalThis.__transport.addEventListener("open",()=>{',
      '  globalThis.__transport.send('+
        (primitive?'"safe-literal-893"':'protocolSensitive')+');',
      '  globalThis.__transport.close();',
      '});'
    ].join('\n')}
  ];
  const native=await captureSourceFrame(files.map(f=>f.code).join('\n'));
  const compiled=obfuscateFiles(files,{
    mode:'coo',strings:true,identifiers:true,properties:false,
    seed:'agent41-websocket-multifile-20261123'
  });
  const code=compiled.files.map(f=>f.code).join('\n');
  const altered=await captureSourceFrame(code);
  const result={
    kind:primitive?'primitive':'function',
    native,altered,parity:native===altered,
    literals:compiled.files.reduce((total,f)=>total+f.metrics.literals,0)
  };
  console.log('CROSSFILE_WEBSOCKET_SOURCE '+JSON.stringify(result));
  if(primitive){
    assert.equal(altered,native,'Multi-file safe primitive string mutated');
    assert.ok(result.literals>0,'Safe string should retain positive encoding yield');
  }else{
    assert.ok(native.includes('function protocolSensitive()'));
    assert.equal(altered,native,'Cross-file WebSocket function-source frame mutated');
  }
}

async function main(){
  await compare(false);
  await compare(true);
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
