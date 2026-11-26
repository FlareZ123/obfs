'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

const sources=[
  {
    path:'entry.mjs',
    sourceType:'module',
    code:[
      "import './patch.mjs';",
      "import {run} from './app.mjs';",
      "import {safeValue} from './safe.mjs';",
      'Function.prototype.bind=globalThis.__nativeBind;',
      'const result=run();',
      'process.stdout.write(JSON.stringify([globalThis.__capturedSource,result,safeValue]));'
    ].join('\n')
  },
  {
    path:'patch.mjs',
    sourceType:'module',
    code:[
      'globalThis.__nativeBind=Function.prototype.bind;',
      'Function.prototype.bind=function(...args){',
      '  globalThis.external(this);',
      '  const target=this;',
      '  return (...callArgs)=>Reflect.apply(target,args[0],callArgs);',
      '};'
    ].join('\n')
  },
  {
    path:'app.mjs',
    sourceType:'module',
    code:[
      'const owner={secretField:7};',
      'const internal=()=>owner.secretField;',
      'const hot=internal.bind(null);',
      'export function run(){return hot();}'
    ].join('\n')
  },
  {
    path:'safe.mjs',
    sourceType:'module',
    code:[
      'const safeOwner={safeField:11};',
      'const direct=()=>safeOwner.safeField;',
      'export const safeValue=direct();'
    ].join('\n')
  }
];

const preloader=[
  'globalThis.__capturedSource=null;',
  'globalThis.external=function(value){',
  '  globalThis.__capturedSource=Function.prototype.toString.call(value);',
  '};'
].join('\n');

/**
 * Run a complete ESM source group with the declared host callback preloaded.
 * @param {{path:string,code:string}[]} files
 * @returns {Promise<[string,number,number]>}
 */
async function run(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sibling-bind-mutation-'));
  try{
    for(const file of files){
      const target=path.join(root,file.path);
      await fs.mkdir(path.dirname(target),{recursive:true});
      await fs.writeFile(target,file.code);
    }
    const preload=path.join(root,'preload.cjs');
    await fs.writeFile(preload,preloader);
    const child=spawnSync(process.execPath,['--require',preload,path.join(root,'entry.mjs')],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {[string,number,number]} */(JSON.parse(child.stdout.trim()));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const mode of /** @type {const} */ (['coo','sno','sco'])){
  test(mode+' sees a sibling-module Function.prototype.bind mutation before app evaluation',async()=>{
    const native=await run(sources);
    const compiled=obfuscateFiles(sources,{
      mode,closedWorld:true,seed:'sibling-bind-mutation-'+mode,
      properties:true,identifiers:false,strings:false
    });
    const app=compiled.files.find(file=>file.path==='app.mjs');
    const safe=compiled.files.find(file=>file.path==='safe.mjs');
    assert.ok(app,'app module must be present in compiled group');
    assert.ok(safe,'safe control module must be present in compiled group');
    const actual=await run(compiled.files.map(file=>({
      path:file.path,code:String(file.code)
    })));
    process.stdout.write('SIBLING_BIND_MUTATION_WITNESS '+JSON.stringify({
      mode,appProperties:app.metrics.properties,safeProperties:safe.metrics.properties,
      nativeSource:native[0],compiledSource:actual[0],
      nativeResult:native[1],compiledResult:actual[1],
      nativeSafe:native[2],compiledSafe:actual[2]
    })+'\n');
    assert.equal(app.metrics.properties,0,
      mode+': a prior sibling module replaces native bind and forwards the target to an opaque observer');
    assert.ok(safe.metrics.properties>=1,
      mode+': an unrelated private direct-call property remains eligible for transformation');
    assert.deepEqual(actual,native,
      mode+': cross-file intrinsic mutation must not invalidate the function-source observer');
  });
}
