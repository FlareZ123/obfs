'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const http=require('node:http');
const vm=require('node:vm');

/**
 * @typedef {'coo'|'sno'|'sco'} Mode
 * @typedef {{path:string,sourceType:'commonjs'|'asset',code:string|Buffer}} File
 * @typedef {{
 *   obfuscateFiles:(files:File[],options:{mode:Mode,seed:string,strings:boolean})=>{files:{path:string,code:string|Buffer}[]},
 *   createScoHandler:(files:File[])=>import('node:http').RequestListener
 * }} Compiler
 */

/** @param {string} root @returns {Compiler} */
function loadCompiler(root){return require(path.resolve(root,'src'));}

/** @param {number} number @returns {Buffer} */
function leb(number) {
  /** @type {number[]} */
  const encoded=[];
  do {
    const next=number>>>7;
    encoded.push((number&0x7f)|(next?0x80:0));
    number=next;
  }while(number);
  return Buffer.from(encoded);
}

const originalName='PrivateMeaningfulFunction_593184';
const base=Buffer.from([
  0,0x61,0x73,0x6d,1,0,0,0,
  1,5,1,0x60,0,1,0x7f,
  3,2,1,0,
  7,7,1,3,0x72,0x75,0x6e,0,0,
  10,6,1,4,0,0x41,42,0x0b
]);

/** @returns {Buffer} */
function debugWasm() {
  const name=Buffer.from(originalName);
  const map=Buffer.concat([leb(1),leb(0),leb(name.length),name]);
  const subsection=Buffer.concat([Buffer.from([1]),leb(map.length),map]);
  const customName=Buffer.from('name');
  const custom=Buffer.concat([leb(customName.length),customName,subsection]);
  return Buffer.concat([base,Buffer.from([0]),leb(custom.length),custom]);
}

/** @param {Buffer|string} distributed @returns {string} */
function extractFunctionName(distributed) {
  const bytes=Buffer.isBuffer(distributed)?distributed:Buffer.from(distributed,'utf8');
  const module=new WebAssembly.Module(bytes);
  const section=WebAssembly.Module.customSections(module,'name');
  assert.equal(section.length,1);
  const text=Buffer.from(section[0]).toString('utf8');
  const actual=/PrivateMeaningfulFunction_[0-9]+/u.exec(text)?.[0];
  assert.ok(actual,'Public Wasm name subsection did not include an original name');
  return actual;
}

/**
 * @param {import('node:http').RequestListener} handler
 * @returns {Promise<{status:number,body:Buffer}>}
 */
async function fetchPublicWasm(handler) {
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  try {
    return await new Promise((resolve,reject)=>{
      http.get({hostname:'127.0.0.1',port:address.port,path:'/obfs/debug.wasm'},response=>{
        /** @type {Buffer[]} */
        const chunks=[];
        response.on('data',chunk=>chunks.push(Buffer.from(chunk)));
        response.on('end',()=>resolve({status:response.statusCode??0,body:Buffer.concat(chunks)}));
        response.on('error',reject);
      }).on('error',reject);
    });
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}

/**
 * @param {string} previousRoot
 * @param {string} protectedRoot
 * @returns {Promise<{
 *   previous:string,protected:string,
 *   modes:{mode:Mode,extracted:boolean,refused:boolean,semantics:boolean}[],
 *   remoteSourceRecovered:boolean,remotePublicationRefused:boolean
 * }>}
 */
async function compare(previousRoot,protectedRoot){
  const previous=loadCompiler(previousRoot),current=loadCompiler(protectedRoot);
  const original='function PrivateMeaningfulFunction_593184(x){return x*5+2;}module.exports=PrivateMeaningfulFunction_593184(8);';
  const wasm=debugWasm();
  const wasmModule=new WebAssembly.Module(wasm);
  const bareModule=new WebAssembly.Module(base);
  assert.equal(/** @type {Function} */ (new WebAssembly.Instance(wasmModule).exports.run)(),42);
  assert.equal(/** @type {Function} */ (new WebAssembly.Instance(bareModule).exports.run)(),42);
  assert.equal(extractFunctionName(wasm),originalName);
  /** @type {File} */
  const entry={path:'entry.cjs',code:original,sourceType:'commonjs'};
  /** @type {File} */
  const asset={path:'debug.wasm',code:wasm,sourceType:'asset'};
  /** @type {{mode:Mode,extracted:boolean,refused:boolean,semantics:boolean}[]} */
  const modes=[];
  for(const mode of /** @type {Mode[]} */ (['coo','sno','sco'])) {
    const options={mode,seed:'wasm-debug-sources',strings:false};
    const output=previous.obfuscateFiles([entry,asset],options);
    const published=output.files.find(file=>file.path==='debug.wasm');
    const executable=output.files.find(file=>file.path==='entry.cjs');
    assert.ok(published);
    assert.ok(executable);
    assert.notEqual(String(executable.code),original,'Baseline must transform executable');
    const native={module:{exports:null}},generated={module:{exports:null}};
    vm.runInNewContext(original,native,{timeout:1500});
    vm.runInNewContext(String(executable.code),generated,{timeout:1500});
    assert.equal(generated.module.exports,native.module.exports);
    assert.equal(extractFunctionName(published.code),originalName);
    assert.throws(()=>current.obfuscateFiles([entry,asset],options),
      /WebAssembly debug metadata would disclose original names or source references/u);
    modes.push({mode,extracted:true,refused:true,semantics:true});
  }
  const httpResponse=await fetchPublicWasm(previous.createScoHandler([asset]));
  assert.equal(httpResponse.status,200);
  assert.equal(extractFunctionName(httpResponse.body),originalName);
  assert.throws(()=>current.createScoHandler([asset]),
    /WebAssembly debug metadata would disclose original names or source references/u);
  return {previous:path.resolve(previousRoot),protected:path.resolve(protectedRoot),
    modes,remoteSourceRecovered:true,remotePublicationRefused:true};
}

if(require.main===module) {
  const previous=process.argv[2],current=process.argv[3];
  if(!previous||!current)throw new TypeError('Expected two repository checkout paths');
  compare(previous,current).then(result=>{
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }).catch(error=>{
    process.stderr.write(String(error.stack||error)+'\n');
    process.exitCode=1;
  });
}

module.exports={compare,extractFunctionName,debugWasm};
