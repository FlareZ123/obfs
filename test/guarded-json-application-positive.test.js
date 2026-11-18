'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');
const {atomicWrite}=require('../src/atomic');
const {ROOT,NAMES,SEED}=require('../examples/application-challenge/build.cjs');
const {ablate,withOwnKeyCalls,withNullPrototypeRecord,withCapturedStringArgv}=
  require('../sims/application-challenge-observer-ablation');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleFile */

/**
 * Produce a distinct, deliberately constrained six-module application.
 * Its host CLI argument is captured once and tested for primitive string
 * identity before any native JSON.parse source coercion can observe it.
 * This changes the original application's host contract; the frozen
 * original source remains an independent unproved/negative fixture.
 *
 * @param {'own-only'|'null-proto'} kind
 * @returns {Promise<ModuleFile[]>}
 */
async function boundedSource(kind) {
  /** @type {ModuleFile[]} */
  const files=await Promise.all(NAMES.map(async name=>({
    path:name,sourceType:'module',
    code:await fs.readFile(path.join(ROOT,'before',name),'utf8')
  })));
  const base=ablate(files,'both');
  const safe=kind==='own-only'?withOwnKeyCalls(base):withNullPrototypeRecord(base);
  return withCapturedStringArgv(safe);
}

/**
 * Execute a real Node ESM app with a preloader capable of replacing argv[2]
 * with a function before any declared module evaluates.
 * @param {string} root
 * @param {boolean} hostile
 * @returns {string}
 */
function run(root,hostile) {
  const preloader=path.join(root,'..','host-input.cjs');
  const args=['--require',preloader,path.join(root,'entry.mjs'),'[[7,400],[13,1000]]'];
  const child=spawnSync(process.execPath,args,{
    encoding:'utf8',timeout:30000,
    env:{...process.env,OBFS_HOSTILE_CLI:hostile?'1':'0'}
  });
  assert.equal(child.error,undefined);
  assert.equal(child.status,0,child.stderr);
  return child.stdout;
}

/**
 * @param {string} dir
 * @param {{path:string,code:string|Buffer}[]} files
 * @returns {Promise<void>}
 */
async function materialize(dir,files) {
  await fs.mkdir(dir,{recursive:true});
  for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
}

for(const kind of /** @type {('own-only'|'null-proto')[]} */
  (['own-only','null-proto'])) {
  test('captured CLI primitive preserves protected six-module '+kind+' graph',async()=>{
    const source=await boundedSource(kind);
    const entry=source.find(file=>file.path==='entry.mjs');
    assert.ok(entry);
    assert.equal(observesFunctionSource(parse(entry.code,'module')),false);
    const output=obfuscateFiles(source,{
      mode:'coo',closedWorld:true,seed:SEED,
      strings:false,identifiers:false,properties:true
    });
    assert.equal(output.crossFile.properties,2,
      JSON.stringify(output.files.map(file=>({path:file.path,code:file.code}))));
    const temp=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-guarded-app-'));
    try {
      const before=path.join(temp,'before');
      const after=path.join(temp,'after');
      await materialize(before,source);
      await materialize(after,output.files);
      await atomicWrite(path.join(temp,'host-input.cjs'),
        "if(process.env.OBFS_HOSTILE_CLI==='1')"+ 
        "process.argv[2]=function hostileSourceFunction(){return 19;};");
      const native=run(before,false);
      assert.equal(run(after,false),native);
      const adversarial=run(before,true);
      assert.equal(run(after,true),adversarial);
      assert.ok(native.length>0);
      assert.ok(adversarial.length>0);
    }finally{await fs.rm(temp,{recursive:true,force:true});}
  });
}
