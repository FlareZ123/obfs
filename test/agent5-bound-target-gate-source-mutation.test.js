'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {parse,hasUnsafeNativeBindMutationSurface}=require('../src/ast');
const {obfuscateFiles}=require('../src');

const custom=`function(...args){
  if(this&&this.name==='internal'&&
     Function.prototype.toString.call(this).includes('owner.secretField')){
    globalThis.external(this);
    const target=this;
    const thisArg=args[0];
    const boundArgs=args.slice(1);
    return (...callArgs)=>Reflect.apply(target,thisArg,[...boundArgs,...callArgs]);
  }
  return Reflect.apply(nativeBind,this,args);
}`;

const mutationCases=[
  ['direct prototype assignment','const nativeBind=Function.prototype.bind;Function.prototype.bind='+custom+';'],
  ['Function constructor alias','const F=Function;const nativeBind=F.prototype.bind;F.prototype.bind='+custom+';'],
  ['global object alias','const g=globalThis;const nativeBind=g.Function.prototype.bind;g.Function.prototype.bind='+custom+';'],
  ['destructured prototype alias','const {prototype:fp}=Function;const nativeBind=fp.bind;fp.bind='+custom+';'],
  ['object-carried prototype alias','const box={prototype:Function.prototype};const nativeBind=box.prototype.bind;box.prototype.bind='+custom+';'],
  ['Reflect.apply argument array','const nativeBind=Function.prototype.bind;Reflect.apply(Object.defineProperty,Object,[Function.prototype,"bind",{value:'+custom+',configurable:true,writable:true}]);'],
  ['inherited __defineGetter__','const nativeBind=Function.prototype.bind;Function.prototype.__defineGetter__("bind",function(){return '+custom+';});']
];

for(const [label,setup] of mutationCases){
  test('strict bound-target gate rejects '+label,()=>{
    const source=[
      'const owner={secretField:7};',
      setup,
      'const internal=()=>owner.secretField;',
      'const hot=internal.bind(null);'
    ].join('\n');
    assert.equal(hasUnsafeNativeBindMutationSurface(parse(source,'module')),true);
  });
}

test('strict bound-target gate admits only the native local-arrow bind baseline',()=>{
  const source='const internal=()=>1;const hot=internal.bind(null);';
  assert.equal(hasUnsafeNativeBindMutationSurface(parse(source,'module')),false);
});

test('strict bound-target gate deliberately refuses harmless intrinsic inspection',()=>{
  const source=[
    'Object.getOwnPropertyNames(Function.prototype);',
    'const internal=()=>1;',
    'const hot=internal.bind(null);'
  ].join('\n');
  assert.equal(hasUnsafeNativeBindMutationSurface(parse(source,'module')),true);
});

/**
 * @param {string} code
 * @returns {Promise<[string,number]>}
 */
async function run(code){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-source-custom-bind-'));
  try{
    const entry=path.join(root,'entry.mjs');
    const preload=path.join(root,'preload.cjs');
    const preloader=[
      'globalThis.__capturedSource=null;',
      'globalThis.external=function(value){',
      '  globalThis.__capturedSource=Function.prototype.toString.call(value);',
      '};'
    ].join('\n');
    await fs.writeFile(entry,code);
    await fs.writeFile(preload,preloader);
    const child=spawnSync(process.execPath,['--require',preload,entry],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {[string,number]} */(JSON.parse(child.stdout.trim()));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

const directMutationSource=[
  'const owner={secretField:7};',
  'const nativeBind=Function.prototype.bind;',
  'Function.prototype.bind=function(...args){',
  '  globalThis.external(this);',
  '  const target=this;',
  '  return (...callArgs)=>Reflect.apply(target,args[0],callArgs);',
  '};',
  'const internal=()=>owner.secretField;',
  'const hot=internal.bind(null);',
  'const result=hot();',
  'Function.prototype.bind=nativeBind;',
  'process.stdout.write(JSON.stringify([globalThis.__capturedSource,result]));'
].join('\n');

for(const mode of /** @type {const} */ (['coo','sno','sco'])){
  test(mode+' preserves source when analyzed code replaces bind and exposes this',async()=>{
    const native=await run(directMutationSource);
    const emitted=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:directMutationSource}],{
      mode,closedWorld:true,seed:'agent5-strict-bind-gate-'+mode,
      properties:true,identifiers:false,strings:false
    });
    const file=emitted.files[0];
    assert.ok(file);
    const actual=await run(String(file.code));
    assert.equal(file.metrics.properties,0);
    assert.deepEqual(actual,native);
  });
}

const siblingMutator=[
  'export const marker=1;',
  'const nativeBind=Function.prototype.bind;',
  'Function.prototype.bind=function(...args){',
  '  globalThis.external(this);',
  '  const target=this;',
  '  return (...callArgs)=>Reflect.apply(target,args[0],callArgs);',
  '};'
].join('\n');

const siblingState=[
  'export const state={secretField:23};'
].join('\n');

const siblingEntry=[
  "import {marker} from './mutator.mjs';",
  "import {state} from './state.mjs';",
  'const internal=(input)=>state.secretField+input;',
  'export const hot=internal.bind(null);',
  'export const markerValue=marker;'
].join('\n');

for(const mode of /** @type {const} */ (['coo','sno','sco'])){
  test(mode+' applies the bind-mutation veto across the supplied module group',()=>{
    const compiled=obfuscateFiles([
      {path:'state.mjs',sourceType:'module',code:siblingState},
      {path:'mutator.mjs',sourceType:'module',code:siblingMutator},
      {path:'app.mjs',sourceType:'module',code:siblingEntry}
    ],{
      mode,closedWorld:true,seed:'agent5-group-bind-mutation-'+mode,
      properties:true,identifiers:false,strings:false
    });
    const state=compiled.files.find(file=>file.path==='state.mjs');
    const app=compiled.files.find(file=>file.path==='app.mjs');
    assert.ok(state);
    assert.ok(app);
    assert.equal(compiled.crossFile.properties,0,
      JSON.stringify({mode,crossFile:compiled.crossFile,state:state.code,app:app.code}));
    assert.match(String(state.code),/secretField/u);
    assert.match(String(app.code),/secretField/u);
  });
}

const nativePositive=[
  'const owner={secretField:7};',
  'const internal=()=>owner.secretField;',
  'export const hot=internal.bind(null);'
].join('\n');

for(const mode of /** @type {const} */ (['coo','sno','sco'])){
  test(mode+' retains nonzero yield for the unmodified native-bound arrow',()=>{
    const compiled=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:nativePositive}],{
      mode,closedWorld:true,seed:'agent5-native-bind-positive-'+mode,
      properties:true,identifiers:false,strings:false
    });
    assert.ok(compiled.files[0]);
    assert.ok(compiled.files[0].metrics.properties>0,
      JSON.stringify({mode,metrics:compiled.files[0].metrics,code:compiled.files[0].code}));
  });
}
