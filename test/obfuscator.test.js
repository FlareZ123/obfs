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
  assert.throws(()=>obfuscateFiles([{path:'x.js',code:'1'},{path:'X.js',code:'2'}]),/Duplicate/);
  for (const bad of ['C:drive.js','aux.js','path/NUL.txt','name.', 'dir/name:stream.js','a|b.js']) {
    assert.throws(()=>obfuscateFiles([{path:bad,code:'1'}]),/Unsafe/,bad);
  }
  assert.throws(()=>obfuscateFiles([{path:'x.js',code:'const ='}]),/Unexpected token/);
});

test('SNO CLI rejects launcher name collisions before producing output',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cli-conflict-'));
  try {
    const src=path.join(dir,'src');
    const out=path.join(dir,'out');
    await fs.mkdir(src);
    await atomicWrite(path.join(src,'index.cjs'),'module.exports=1;');
    await atomicWrite(path.join(src,'sno-entry.cjs'),'module.exports=2;');
    const cli=path.join(__dirname,'../bin/sno.js');
    const proc=spawnSync(process.execPath,[cli,'--root',src,'--entry','index.cjs','--out',out],{encoding:'utf8'});
    assert.notEqual(proc.status,0);
    assert.match(proc.stderr,/collides with an input/);
    await assert.rejects(fs.access(out));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
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

test('literal-key destructuring preserves binding names and can be renamed',()=>{
  const sources=[
    'const state={secret:7,other:11};const {secret,other:second}=state;module.exports=[secret,second,state.secret];',
    'const state={secret:13};function get(p){const {secret:local}=p;return local;}module.exports=get(state);',
    'const state={secret:17};const {secret}=state;module.exports=secret;'
  ];
  for(const source of sources) {
    const out=obfuscateFiles([{path:'entry.cjs',code:source}],{mode:'sno',seed:'destructure',strings:false});
    assert.ok(out.files[0].metrics.properties>=1,source);
    assert.equal(JSON.stringify(evaluate(source)),JSON.stringify(evaluate(out.files[0].code)),source);
    assert.doesNotMatch(out.files[0].code,/\{secret:/);
  }
  for(const source of [
    'const state={secret:7};const {["secret"]:value}=state;module.exports=value;',
    'const state={secret:7};const {...rest}=state;module.exports=rest.secret;',
    'const state={secret:7};const {secret=13}=state;module.exports=secret;'
  ]) {
    const out=obfuscateFiles([{path:'entry.cjs',code:source}],{mode:'sno',seed:'destructure',strings:false});
    assert.equal(out.files[0].metrics.properties,0,source);
    assert.equal(JSON.stringify(evaluate(source)),JSON.stringify(evaluate(out.files[0].code)));
  }
});

test('closed-world ESM destructuring follows cross-module property names',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cross-pattern-'));
  try {
    const input=[
      {path:'state.mjs',code:'export const state={secret:23};'},
      {path:'entry.mjs',code:'import {state} from "./state.mjs";const {secret}=state;export const result=secret;'}
    ];
    const result=obfuscateFiles(input,{mode:'coo',closedWorld:true,seed:'cross-pattern',strings:false});
    assert.equal(result.crossFile.properties,1);
    for(const file of result.files) await atomicWrite(path.join(dir,file.path),file.code);
    const proc=spawnSync(process.execPath,['--input-type=module','--eval',`import(${JSON.stringify('file://'+path.join(dir,'entry.mjs'))}).then(m=>console.log(m.result))`],{encoding:'utf8'});
    assert.equal(proc.status,0,proc.stderr);
    assert.equal(proc.stdout.trim(),'23');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('escaped aliases exported as const disable private property rename',()=>{
  const sources=[
    'const state={secret:7};export const alias=state;export const result=state.secret;',
    'const state={secret:7};export const alias=state;const x=state.secret;export const result=x;'
  ];
  for(const source of sources) {
    for(const closedWorld of [false,true]) {
      const out=obfuscateFiles([{path:'exposed.mjs',code:source}],{
        mode:'coo',seed:'export-escape',closedWorld,identifiers:false,strings:false
      });
      assert.equal(out.files[0].metrics.properties,0,source);
      assert.match(out.files[0].code,/secret/);
    }
  }
  const exporter='export const state={secret:7};export const alias=state;';
  const importer='import {state} from "./exposed.mjs";export const result=state.secret;';
  const out=obfuscateFiles([{path:'exposed.mjs',code:exporter},{path:'reader.mjs',code:importer}],{
    mode:'coo',seed:'export-escape',closedWorld:true,strings:false
  });
  assert.equal(out.crossFile.properties,0);
});

test('closed-world refuses opaque consumers in mixed source groups',()=>{
  const exported={path:'state.mjs',code:'export const state={secret:19};'};
  for(const opaque of [
    {path:'loader.cjs',code:'import("./state.mjs").then(m=>m.state.secret);'},
    {path:'index.html',sourceType:'asset',code:'<script type="module">import {state} from "./state.mjs"; console.log(state.secret)</script>'},
    {path:'browser.js',sourceType:'script',code:'import("./state.mjs").then(m=>m.state.secret);'}
  ]) {
    const output=obfuscateFiles([exported,opaque],{mode:'coo',closedWorld:true,seed:'mixed'});
    assert.equal(output.crossFile.properties,0);
    assert.match(output.files[0].code,/secret/);
  }
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

test('SCO keeps server-side method implementation undistributed and guards RPC',async()=>{
  const privateSecret='server-only-private-implementation-909090';
  let calls=0;
  const handler=createScoHandler([{path:'client.js',code:'globalThis.client="browser-code";',sourceType:'script'}],{
    remoteMethods:{multiply:(n)=>{calls++;return n*privateSecret.length;}},
    authorizeRpc:request=>request.headers['x-authorized']==='yes',
    maxRpcBytes:512
  });
  assert.throws(()=>createScoHandler([],{remoteMethods:{f:()=>1}}),/authorizeRpc/);
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  /** @param {string} method @param {string} body @param {boolean} [authenticated] */
  function request(method,body,authenticated=true){
    return new Promise((resolve,reject)=>{
      const req=http.request({host:'127.0.0.1',port:address.port,path:'/obfs/rpc',method,
        headers:{'content-type':'application/json','x-authorized':authenticated?'yes':'no'}},res=>{
          let data='';res.on('data',chunk=>data+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:data}));
        });
      req.on('error',reject);
      req.end(body);
    });
  }
  try {
    const unauthorized=await request('POST',JSON.stringify({method:'multiply',args:[4]}),false);
    assert.equal(unauthorized.status,403);
    assert.equal(calls,0);
    const result=await request('POST',JSON.stringify({method:'multiply',args:[3]}));
    assert.equal(result.status,200);
    assert.equal(JSON.parse(result.body).value,3*privateSecret.length);
    assert.equal(calls,1);
    assert.equal((await request('POST','{invalid')).status,400);
    assert.equal((await request('POST',JSON.stringify({method:'toString',args:[]}))).status,400);
    assert.equal((await request('POST','x'.repeat(600))).status,413);
    assert.equal(calls,1);
    const served=await new Promise((resolve,reject)=>{
      http.get({host:'127.0.0.1',port:address.port,path:'/obfs/client.js'},response=>{
        let data='';response.on('data',chunk=>data+=chunk);response.on('end',()=>resolve(data));
      }).on('error',reject);
    });
    assert.ok(!served.includes(privateSecret));
  } finally {await new Promise(resolve=>server.close(resolve));}
});


test('host lock rejects static ESM evaluation that would precede authorization',()=>{
  for(const code of [
    'import "./side-effect.mjs";globalThis.result=1;',
    'export {sideEffect} from "./side-effect.mjs";',
    'export * from "./side-effect.mjs";'
  ]) {
    assert.throws(()=>obfuscateFiles([{path:'index.mjs',code}],{mode:'coo',allowedHosts:['example.org']}),/Host locking ESM static imports/);
  }
  const code='export const secret="works-after-lock";';
  const output=obfuscateFiles([{path:'index.mjs',code}],{mode:'coo',allowedHosts:['example.org']}).files[0].code;
  assert.match(output,/Unauthorized execution host/);
});

test('identifier renaming retains object literal shorthand and captured values',()=>{
  const examples=[
    'const item=7;module.exports={item};',
    'function f(value){return {value}};module.exports=f(9);',
    'const outer=4;module.exports=(()=>{const local=outer;return {local}})();',
    'function f(v){return ()=>v};module.exports=f(12)();',
    'let value=1;value++;module.exports={value, result:value};',
    'const outer=3;module.exports={a:outer,b:{outer}};',
    'let v=3;module.exports=({v}={v:9});'
  ];
  let changes=0;
  for(const source of examples) {
    const expected=JSON.stringify(evaluate(source));
    const out=obfuscateFiles([{path:'entry.cjs',code:source}],{mode:'sno',seed:'identifiers',properties:false,strings:false}).files[0];
    assert.equal(JSON.stringify(evaluate(out.code)),expected,`${source} => ${out.code}`);
    changes+=out.metrics.bindings;
  }
  assert.ok(changes>=5);
});

test('identifier renaming retains external member fields and rejects eval',()=>{
  for(const source of [
    'const external=globalThis.host;module.exports=external.expected;',
    'const value=1;module.exports=eval("value+3");',
    'const name=5;module.exports=({name:7}).name+name;',
    'function f(value){return arguments[0]+value};module.exports=f(5);'
  ]) {
    const transformed=obfuscateFiles([{path:'file.cjs',code:source}],{mode:'sno',seed:'negative',properties:false,strings:false}).files[0].code;
    const context={host:{expected:7}};
    const a={module:{exports:undefined},...context};
    const b={module:{exports:undefined},...context};
    vm.runInNewContext(source,a);
    vm.runInNewContext(transformed,b);
    assert.equal(a.module.exports,b.module.exports,`${source} => ${transformed}`);
  }
});
