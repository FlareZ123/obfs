'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const {obfuscateFiles,createSnoLauncher,createScoHandler} = require('../src');
const {atomicWrite} = require('../src/atomic');

/** @param {string} code @returns {unknown} */
function evaluate(code) {
  const context = {module:{exports:{}},console,globalThis:null};
  context.globalThis = context;
  vm.runInNewContext(code,context,{timeout:1000});
  return context.module.exports;
}

/** @param {string} source @param {'commonjs'|'module'|'script'} [sourceType] */
function transform(source,sourceType='commonjs') {
  return obfuscateFiles([{path:'app.cjs',code:source,sourceType}],{mode:'sno',seed:'test-seed'}).files[0];
}

test('aliases and interprocedural reads preserve result and rename own keys',()=>{
  const source = `const state={secret:42,label:'hello-world'};const alias=state;function get(p){return p.secret+' '+alias.label;}module.exports=get(state);`;
  const out = transform(source);
  assert.equal(evaluate(out.code),evaluate(source));
  assert.equal(out.metrics.objects,1);
  assert.equal(out.metrics.properties,2);
  assert.doesNotMatch(out.code,/\.secret\b/);
});

test('identity forwarding through const aliases remains equivalent',()=>{
  const source = `const a={hidden:17};function id(v){return v}const c=id(a);module.exports=c.hidden;`;
  const out = transform(source);
  assert.equal(evaluate(out.code),17);
  assert.equal(out.metrics.properties,1);
});

test('mixed function callers do not allow unsound parameter rewriting',()=>{
  const source = `const a={hidden:11};const b={hidden:12};function get(v){return v.hidden;}module.exports=get(a)+get(b);`;
  const out = transform(source);
  assert.equal(evaluate(out.code),evaluate(source));
  assert.equal(out.metrics.objects,0);
});

test('reflection, computed properties, outward escapes, and shadowing are rejected',()=>{
  const samples = [
    `const x={private:1};const k='private';module.exports=x[k];`,
    `const x={private:1};module.exports=Object.keys(x);`,
    `const x={private:1};module.exports=x;`,
    `const x={private:1};function f(x){return x.private}module.exports=x.private;`,
    `const x={private:1};with({}){module.exports=x.private;}`,
    `const x={private:1};eval('0');module.exports=x.private;`
  ];
  for (const source of samples) {
    const out = transform(source);
    assert.equal(out.metrics.objects,0,source);
    assert.deepEqual(JSON.parse(JSON.stringify(evaluate(out.code))),JSON.parse(JSON.stringify(evaluate(source))));
  }
});

test('string encoding preserves escaped text, surrogate pairs, directives, and require specifiers',()=>{
  const source = `'use strict';const a='grüß Gott 😀';const b='unpaired\\uD800';const c='\\0\\n\\t';module.exports=[a,b,c,'foobar-baz'];`;
  const out = transform(source);
  assert.equal(JSON.stringify(evaluate(out.code)),JSON.stringify(evaluate(source)));
  assert.match(out.code,/^'use strict';/);
  assert.ok(out.metrics.literals>=2);
});

test('for-loop string sites are skipped to protect hot-path performance',()=>{
  const source = `let v=0;for(let i=0;i<100;i++){if('hot-string'==='hot-string')v++;}module.exports=v;`;
  const out = transform(source);
  assert.equal(out.metrics.literals,0);
  assert.equal(evaluate(out.code),100);
});

test('host lock permits a listed hostname and rejects another hostname',()=>{
  const source = `'use strict';globalThis.result='success-value';`;
  const output = obfuscateFiles([{path:'app.js',code:source,sourceType:'script'}],{
    mode:'coo',seed:'lock',allowedHosts:['allowed.example']
  }).files[0].code;
  const good = {location:{hostname:'allowed.example'}};
  vm.runInNewContext(output,good);
  assert.equal(good.result,'success-value');
  assert.throws(()=>vm.runInNewContext(output,{location:{hostname:'evil.example'}}),/Unauthorized execution host/);
});

test('exported object public ABI remains stable',()=>{
  const source = `export const state={publicField:7};export function read(){return state.publicField;}`;
  const out = obfuscateFiles([{path:'index.mjs',code:source}],{mode:'coo',seed:'abi'}).files[0];
  assert.equal(out.metrics.properties,0);
  assert.match(out.code,/publicField/);
});

test('path traversal, collision and malformed syntax are rejected',()=>{
  assert.throws(()=>obfuscateFiles([{path:'../hack.js',code:'1'}]),/Unsafe/);
  assert.throws(()=>obfuscateFiles([{path:'x.js',code:'1'},{path:'x.js',code:'2'}]),/Duplicate/);
  assert.throws(()=>obfuscateFiles([{path:'x.js',code:'const ='}]),/Unexpected token/);
});

test('SNO loader checks every file before running one CommonJS entry',async()=>{
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-test-'));
  try {
    const src = [{path:'entry.cjs',code:'module.exports=require("./helper.cjs").value;'},{path:'helper.cjs',code:'module.exports={value:27};'}];
    const result=obfuscateFiles(src,{mode:'sno',seed:'sno'});
    for(const f of result.files) await atomicWrite(path.join(dir,f.path),f.code);
    const launcher=createSnoLauncher(result.files,'entry.cjs');
    await atomicWrite(path.join(dir,'sno-entry.cjs'),launcher);
    let proc=spawnSync(process.execPath,['-e',`console.log(require(${JSON.stringify(path.join(dir,'sno-entry.cjs'))}))`],{encoding:'utf8'});
    assert.equal(proc.status,0,proc.stderr);
    assert.equal(proc.stdout.trim(),'27');
    await atomicWrite(path.join(dir,'helper.cjs'),'module.exports={value:99};');
    proc=spawnSync(process.execPath,[path.join(dir,'sno-entry.cjs')],{encoding:'utf8'});
    assert.notEqual(proc.status,0);
    assert.match(proc.stderr,/Integrity check failed/);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('SCO returns distinct obfuscation on repeated legitimate requests',async()=>{
  const handler=createScoHandler([{path:'a.js',code:`globalThis.value='long-long-value';`,sourceType:'script'}],{routePrefix:'/obfs/',allowedHosts:['www.example.org']});
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    /** @param {string} host @returns {Promise<{status:number,body:string}>} */
    function get(host) {
      return new Promise((resolve,reject)=>{
        http.get({host:'127.0.0.1',port:address.port,path:'/obfs/a.js',headers:{Host:host}},response=>{
          let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode,body}));
        }).on('error',reject);
      });
    }
    const first=await get('www.example.org');
    const second=await get('www.example.org');
    assert.equal(first.status,200);
    assert.equal(second.status,200);
    assert.notEqual(first.body,second.body);
    const context={location:{hostname:'www.example.org'}};
    vm.runInNewContext(first.body,context);
    assert.equal(context.value,'long-long-value');
    assert.equal((await get('other.example.org')).status,403);
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test('atomic file replacement writes a complete consistent value',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-atomic-'));
  try {
    const output=path.join(dir,'data.bin');
    await Promise.all([atomicWrite(output,Buffer.alloc(1000,65)),atomicWrite(output,Buffer.alloc(2000,66))]);
    const data=await fs.readFile(output);
    assert.ok(data.length===1000||data.length===2000);
    assert.ok([...data].every(x=>x===data[0]));
    assert.deepEqual(await fs.readdir(dir),['data.bin']);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('closed-world ESM importer and exporter agree on renamed property',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-'));
  try {
    const inputs=[
      {path:'lib/state.mjs',code:'export const state={privateKey:13};'},
      {path:'entry.mjs',code:'import {state as imported} from "./lib/state.mjs";export const result=imported.privateKey;'}
    ];
    const obfuscated=obfuscateFiles(inputs,{mode:'coo',seed:'cross',closedWorld:true});
    assert.equal(obfuscated.crossFile.properties,1);
    assert.doesNotMatch(obfuscated.files.find(f=>f.path==='entry.mjs').code,/\.privateKey/);
    for(const item of obfuscated.files) await atomicWrite(path.join(dir,item.path),item.code);
    const result=spawnSync(process.execPath,['--input-type=module','--eval',`import(${JSON.stringify('file://'+path.join(dir,'entry.mjs'))}).then(m=>console.log(m.result))`],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout.trim(),'13');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('closed-world rejects namespace import and dynamic importing',()=>{
  const publisher={path:'state.mjs',code:'export const state={secretValue:9};'};
  for(const reader of [
    'import * as ns from "./state.mjs";export const x=ns.state.secretValue;',
    'export async function f(){return (await import("./state.mjs")).state.secretValue;}'
  ]) {
    const transformed=obfuscateFiles([publisher,{path:'reader.mjs',code:reader}],{mode:'coo',closedWorld:true,seed:'guard'});
    assert.equal(transformed.crossFile.properties,0);
  }
});

test('JS external API names remain untouched',()=>{
  const code=`globalThis.module.exports=globalThis.window.document.title+' hello-world';`;
  const out=obfuscateFiles([{path:'external.js',code,sourceType:'script'}],{mode:'coo',seed:'externals'}).files[0];
  const context={window:{document:{title:'Test'}}};
  context.module={exports:''};
  vm.runInNewContext(out.code,context);
  assert.equal(context.module.exports,'Test hello-world');
  assert.match(out.code,/\.document\.title/);
});

test('arguments alias blocks interprocedural rename',()=>{
  const code=`const state={secretField:17};function inspect(p){return arguments[0].secretField;}module.exports=inspect(state);`;
  const out=transform(code);
  assert.equal(evaluate(out.code),17);
  assert.equal(out.metrics.properties,0);
});

test('asset content stays binary-exact',()=>{
  const bytes=Buffer.from([0,255,200,1,2,3]);
  const output=obfuscateFiles([{path:'binary.data',code:bytes,sourceType:'asset'}],{mode:'sno'});
  assert.deepEqual(output.files[0].code,bytes);
});
