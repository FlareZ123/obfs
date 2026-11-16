'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');

/** @param {string} file @returns {string} */
function sha256(file){
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** @param {string} directory @returns {Record<string,string>} */
function diskDigests(directory){
  /** @type {Record<string,string>} */
  const hashes={};
  for(const name of fs.readdirSync(directory).sort()){
    const filename=path.join(directory,name);
    if(!fs.statSync(filename).isFile())throw Error('Expected flat public distribution');
    hashes[name]=sha256(filename);
  }
  return hashes;
}

/**
 * A Node 22.15+ synchronous module hook runs on the same thread when preloaded
 * with --import. It substitutes in-memory source for the already verified
 * distributed math.mjs module, without patching disk files or using a compiler.
 *
 * @param {boolean} [legacy]
 * @returns {string}
 */
function preloaderDataUrl(legacy=false){
  const substituted=[
    'export function round1(input){return input|0;}',
    'export function round2(input){return input|0;}',
    'export function round3(input){return input|0;}',
    'export function digest(){return 777;}'
  ].join('\n');
  const source=JSON.stringify(substituted);
  const legacyHook="export async function load(url,context,nextLoad){"+
    "const result=await nextLoad(url,context);"+
    "return url.endsWith('/math.mjs')?{...result,source:"+source+"}:result;}";
  const legacyUrl='data:text/javascript,'+encodeURIComponent(legacyHook);
  const code=legacy?
    "import {register} from 'node:module';register("+JSON.stringify(legacyUrl)+",import.meta.url);":
    "import {registerHooks} from 'node:module';"+
    "registerHooks({load(url,context,nextLoad){"+
    "const result=nextLoad(url,context);"+
    "return url.endsWith('/math.mjs')?{...result,source:"+source+"}:result;}});";
  return 'data:text/javascript,'+encodeURIComponent(code);
}

/**
 * @param {string[]} args
 * @returns {{status:number|null,stdout:string,stderr:string}}
 */
function execute(args){
  const proc=spawnSync(process.execPath,args,{
    encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024
  });
  if(proc.error)throw proc.error;
  return {status:proc.status,stdout:proc.stdout,stderr:proc.stderr};
}

/**
 * Independent full-runtime attacker. Receives only a pre-obfuscated SNO
 * directory and uses built-in Node APIs to run the same launcher both before
 * and after activating an attacker-controlled ESM in-memory load hook.
 *
 * @param {string} publicDirectory
 * @returns {{publishedFiles:number,modifiedFiles:number,normalLast:number,hookedLast:number,normalManifestAccepted:boolean,hookedManifestAccepted:boolean,hookModes:string[]}}
 */
function runAttack(publicDirectory){
  const entry=path.join(publicDirectory,'sno-entry.cjs');
  const cases=[[17,[{kind:'open',payload:'A'},{kind:'tick',payload:'β'}]]];
  const serialized=JSON.stringify(cases);
  const before=diskDigests(publicDirectory);
  assert.equal(Object.hasOwn(before,'math.mjs'),true);
  assert.equal(Object.hasOwn(before,'sno-entry.cjs'),true);

  const normal=execute([entry,serialized]);
  assert.equal(normal.status,0,normal.stderr);
  const baseline=JSON.parse(normal.stdout);
  const normalState=JSON.parse(baseline[0].value).snapshot;
  assert.equal(typeof normalState.last,'number');

  // registerHooks appeared in Node 22.15. The async register/load API
  // is available from Node 22.0, matching the project's declared engine.
  const modes=typeof require('node:module').registerHooks==='function'?
    ['sync','async']:['async'];
  for(const mode of modes){
    const hooked=execute(['--import',preloaderDataUrl(mode==='async'),entry,serialized]);
    assert.equal(hooked.status,0,mode+': '+hooked.stderr);
    const injected=JSON.parse(hooked.stdout);
    const hookedOutput=JSON.parse(injected[0].value);
    assert.equal(hookedOutput.snapshot.last,777,mode);
    assert.deepEqual(hookedOutput.trace.map((/** @type {{value:number}} */ event)=>event.value),[777,777]);
    assert.deepEqual(injected[0].external,hookedOutput.trace);
  }
  assert.notEqual(normalState.last,777,'Native computation accidentally equals injected constant');

  const after=diskDigests(publicDirectory);
  assert.deepEqual(after,before,'In-memory hook must not modify a single published file');
  return {
    publishedFiles:Object.keys(before).length,
    modifiedFiles:0,
    normalLast:normalState.last,
    hookedLast:777,
    normalManifestAccepted:true,
    hookedManifestAccepted:true,
    hookModes:modes
  };
}

if(require.main===module){
  try{
    if(!process.argv[2])throw Error('Expected public SNO directory');
    process.stdout.write('SNO_RUNTIME_HOOK_ATTACK '+
      JSON.stringify(runAttack(path.resolve(process.argv[2])))+'\n');
  }catch(error){
    console.error(error);
    process.exitCode=1;
  }
}

module.exports={runAttack};
