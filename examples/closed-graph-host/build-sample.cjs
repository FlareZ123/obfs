'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../../src');

const names=['entry.mjs','logic.mjs','state.mjs'];
const files=names.map(name=>({
  path:name,sourceType:/** @type {'module'} */ ('module'),
  code:fs.readFileSync(path.join(__dirname,'before',name),'utf8')
}));
const emitted=obfuscateFiles(files,{
  mode:'coo',seed:'agent15-closed-module-host',closedWorld:true,
  allowedHosts:['allowed.example'],strings:false,identifiers:false
});
assert.deepEqual(emitted.crossFile,{objects:1,properties:2});
for(const file of emitted.files) {
  const expected=fs.readFileSync(path.join(__dirname,'after',file.path),'utf8');
  assert.equal(file.code,expected,'Emitted bytes differ: '+file.path);
  assert.match(file.code,/Unauthorized execution host/);
}

/**
 * Invoke the published ESM entry from an actual Node process, with the
 * location provided before the first dynamic import.
 * @param {'before'|'after'} relative
 * @param {string} hostname
 * @returns {{events:string[],answer?:number,error?:string}}
 */
function execute(relative,hostname) {
  const entry=pathToFileURL(path.join(__dirname,relative,'entry.mjs')).href;
  const runner='globalThis.location={hostname:'+JSON.stringify(hostname)+'};'+
    'globalThis.events=[];'+
    'import('+JSON.stringify(entry)+').then(()=>{'+
    'process.stdout.write(JSON.stringify({events:globalThis.events,answer:globalThis.answer}));'+
    '},error=>{process.stdout.write(JSON.stringify({events:globalThis.events,error:error.message}));});';
  const child=spawnSync(process.execPath,['--input-type=module','-e',runner],{
    encoding:'utf8',timeout:15000
  });
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return JSON.parse(child.stdout);
}
const original=execute('before','allowed.example');
assert.deepEqual(original,{events:['state','logic','entry'],answer:24});
assert.deepEqual(execute('after','allowed.example'),original);
const refused=execute('after','untrusted.example');
assert.deepEqual(refused.events,[]);
assert.match(refused.error??'',/Unauthorized execution host/);
console.log(JSON.stringify({
  originalBytes:files.reduce((n,file)=>n+Buffer.byteLength(file.code),0),
  emittedBytes:emitted.files.reduce((n,file)=>n+Buffer.byteLength(file.code),0),
  ownKeys:emitted.crossFile.properties,
  authorized:original,denied:refused
}));
