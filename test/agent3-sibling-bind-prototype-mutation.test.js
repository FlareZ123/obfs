'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {parse,hasUnsafeNativeBindMutationSurface}=require('../src/ast');
const {hasUnmodeledNativeBindGlobalReference}=require('../src/properties');

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

test('native-bind mutation gate rejects dynamically computed prototype paths',()=>{
  const source="function mutate(key){const proto=(()=>{})[key];proto.bind=function(){};}";
  assert.equal(hasUnsafeNativeBindMutationSurface(parse(source,'module')),true);
});

test('native-bind proof rejects ambient calls but accepts the CommonJS export root',()=>{
  const unsafe=parse("const owner={secretField:7};const internal=()=>owner.secretField;"+
    "const hot=internal.bind(null);mutate();",'module');
  assert.equal(hasUnmodeledNativeBindGlobalReference(unsafe),true);
  const commonjs=parse("'use strict';const owner={secretField:7};"+
    "const internal=()=>owner.secretField;module.exports.hot=internal.bind(null);",'script');
  assert.equal(hasUnmodeledNativeBindGlobalReference(commonjs,true),false);
  const esmWithAmbientModule=parse("const owner={secretField:7};const internal=()=>owner.secretField;"+
    "module.exports.hot=internal.bind(null);",'module');
  assert.equal(hasUnmodeledNativeBindGlobalReference(esmWithAmbientModule),true);
});

test('same-file custom bind replacement refuses target while preserving unrelated direct yield',async()=>{
  const sameFile=[{
    path:'entry.mjs',
    sourceType:'module',
    code:[
      'const nativeBind=Function.prototype.bind;',
      'Function.prototype.bind=function(thisArg,...boundArgs){',
      '  globalThis.external(this);',
      '  const target=this;',
      '  return (...callArgs)=>Reflect.apply(target,thisArg,[...boundArgs,...callArgs]);',
      '};',
      'const owner={secretField:7};',
      'const internal=()=>owner.secretField;',
      'export const hot=internal.bind(null);',
      'Function.prototype.bind=nativeBind;',
      'const safeOwner={safeField:11};',
      'const direct=()=>safeOwner.safeField;',
      'const safeValue=direct();',
      'process.stdout.write(JSON.stringify([globalThis.__capturedSource,hot(),safeValue]));'
    ].join('\n')
  }];
  const native=await run(sameFile);
  assert.match(native[0],/owner\.secretField/u);
  const compiled=obfuscateFiles(sameFile,{
    mode:'coo',closedWorld:true,seed:'same-file-bind-mutation-refusal',
    properties:true,identifiers:false,strings:false
  });
  assert.equal(compiled.files[0].metrics.properties,1,
    'the bound target must refuse while the unrelated direct-call owner still rewrites');
  const emitted=await run(compiled.files.map(file=>({
    path:file.path,code:String(file.code)
  })));
  assert.deepEqual(emitted,native);
  assert.match(emitted[0],/owner\.secretField/u,
    'the in-graph custom bind observer must retain the original target source');
  assert.doesNotMatch(String(compiled.files[0].code),/safeField/u,
    'the unrelated direct-call owner should still be transformed');
});

for(const mode of /** @type {const} */ (['coo','sno','sco'])){
  test(mode+' sees a sibling-module Function.prototype.bind mutation before app evaluation',async()=>{
    const native=await run(sources);
    assert.match(native[0],/secretField/,'native fixture must prove the sibling bind patch observed the original function');
    assert.equal(native[1],7,'native fixture result must be 7');
    assert.equal(native[2],11,'native safe control result must be 11');
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
