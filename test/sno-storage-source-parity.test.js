'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles,createSnoLauncher}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');
const {atomicWrite}=require('../src/atomic');

const [nodeMajor,nodeMinor]=process.versions.node.split('.').map(Number);
const supportsExperimentalWebStorage=nodeMajor>22 ||
  nodeMajor===22 && nodeMinor>=4;

/**
 * Run one CommonJS program with Node's opt-in native Web Storage implementation.
 * @param {string} entry
 * @param {string} storageFile
 * @param {string} [preloadFile]
 * @returns {{nativeDispatch?:boolean,stored?:string|null,keySource?:string|null,valueSource?:string|null,propertyValue?:string|null,length?:number,methodCalls?:number,value:number,independent:number}}
 */
function runWithWebStorage(entry,storageFile,preloadFile) {
  const args=['--experimental-webstorage','--localstorage-file='+storageFile];
  if(preloadFile)args.push('--require',preloadFile);
  args.push(entry);
  const child=spawnSync(process.execPath,args,{encoding:'utf8',timeout:15000});
  assert.equal(child.error,undefined,String(child.error??''));
  assert.equal(child.status,0,child.stderr);
  return /** @type {{nativeDispatch?:boolean,stored?:string|null,keySource?:string|null,valueSource?:string|null,propertyValue?:string|null,length?:number,methodCalls?:number,value:number,independent:number}} */(
    JSON.parse(child.stdout)
  );
}
 
/**
 * Build two one-entry SNO packages so the runtime witness exercises the real
 * hash-checking bootloader rather than directly invoking the transformed file.
 * @param {string} root
 * @param {string} source
 * @param {string} protectedCode
 * @returns {Promise<{nativeLauncher:string,protectedLauncher:string,nativeStorage:string,protectedStorage:string}>}
 */
async function writeSnoPackages(root,source,protectedCode) {
  const nativeRoot=path.join(root,'native');
  const protectedRoot=path.join(root,'protected');
  await fs.mkdir(nativeRoot,{recursive:true});
  await fs.mkdir(protectedRoot,{recursive:true});
  const nativeLauncher=path.join(nativeRoot,'sno-entry.cjs');
  const protectedLauncher=path.join(protectedRoot,'sno-entry.cjs');
  await atomicWrite(path.join(nativeRoot,'entry.cjs'),source);
  await atomicWrite(path.join(protectedRoot,'entry.cjs'),protectedCode);
  await atomicWrite(nativeLauncher,
    createSnoLauncher([{path:'entry.cjs',code:source}],'entry.cjs'));
  await atomicWrite(protectedLauncher,
    createSnoLauncher([{path:'entry.cjs',code:protectedCode}],'entry.cjs'));
  const nativeStorage=path.join(root,'native-storage.db');
  const protectedStorage=path.join(root,'protected-storage.db');
  await fs.writeFile(nativeStorage,'');
  await fs.writeFile(protectedStorage,'');
  return {nativeLauncher,protectedLauncher,nativeStorage,protectedStorage};
}

test('SNO Node Web Storage exposes changed callable source through native DOMString conversion',{
  skip:!supportsExperimentalWebStorage,
  timeout:30000
},async()=>{
  const source=[
    "'use strict';",
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'function independent(){const independentLocal=7;return independentLocal;}',
    'const storage=globalThis.localStorage;',
    'const nativeSetItem=Storage.prototype.setItem;',
    'const nativeDispatch=storage.setItem===nativeSetItem;',
    'storage.clear();',
    'storage.setItem(inspect,"sno-key-position");',
    'Reflect.apply(nativeSetItem,storage,["sno-value-position",inspect]);',
    'const result={nativeDispatch,',
    '  keySource:storage.key(0),',
    '  valueSource:storage.getItem("sno-value-position"),',
    '  value:inspect(),independent:independent()};',
    'process.stdout.write(JSON.stringify(result));'
  ].join('\n');
  assert.equal(observesFunctionSource(parse(source,'commonjs')),false,
    'the current AST observer does not classify this native Storage conversion');
  const transformed=obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code:source
  }],{
    mode:'sno',
    seed:'sno-node-webstorage-source-observation',
    strings:false,
    identifiers:true,
    properties:false
  });
  const file=transformed.files[0];
  assert.ok(file,'expected one transformed SNO entry');
  const protectedCode=String(file.code);
  assert.ok(file.metrics.bindings>=2,'expected nonzero identifier-transform yield');
  assert.ok(!protectedCode.includes('privateLocal'),'expected the observed callable body to be changed');
  assert.ok(!protectedCode.includes('independentLocal'),'expected unrelated positive-control yield');

  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-webstorage-'));
  try {
    const packages=await writeSnoPackages(root,source,protectedCode);
    const native=runWithWebStorage(packages.nativeLauncher,packages.nativeStorage);
    const emitted=runWithWebStorage(packages.protectedLauncher,packages.protectedStorage);

    assert.equal(native.nativeDispatch,true);
    assert.equal(emitted.nativeDispatch,true);
    assert.equal(native.value,29);
    assert.equal(emitted.value,29);
    assert.equal(native.independent,7);
    assert.equal(emitted.independent,7);
    assert.ok(native.keySource?.includes('privateLocal'),'native Storage key conversion should retain original callable source');
    assert.ok(native.valueSource?.includes('privateLocal'),'native Storage value conversion should retain original callable source');
    assert.ok(emitted.keySource && !emitted.keySource.includes('privateLocal'),
      'captured native Storage key conversion should expose transformed callable source');
    assert.ok(emitted.valueSource && !emitted.valueSource.includes('privateLocal'),
      'native Storage value conversion should expose transformed callable source');
    assert.equal(native.keySource,native.valueSource);
    assert.equal(emitted.keySource,emitted.valueSource);
    assert.notEqual(native.keySource,emitted.keySource,
      'SNO identifier edits must not silently change native Storage DOMString output');

    console.log(JSON.stringify({
      mode:'sno',
      node:process.versions.node,
      host:'Node --experimental-webstorage',
      nativeKeySource:native.keySource,
      emittedKeySource:emitted.keySource,
      nativeValueSource:native.valueSource,
      emittedValueSource:emitted.valueSource,
      nativeDispatch:native.nativeDispatch,
      nativeValue:native.value,
      emittedValue:emitted.value,
      independent:native.independent,
      emittedIndependent:emitted.independent,
      renamedBindings:file.metrics.bindings,
      sourceParity:false
    }));
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('SNO Node Web Storage primitive DOMString value retains unrelated identifier yield',{
  skip:!supportsExperimentalWebStorage,
  timeout:30000
},async()=>{
  const source=[
    "'use strict';",
    'function independent(){const independentLocal=7;return independentLocal;}',
    'const nativeDispatch=localStorage.setItem===Storage.prototype.setItem;',
    'localStorage.clear();',
    'localStorage.setItem("sno-primitive-value","literal");',
    'const result={nativeDispatch,stored:localStorage.getItem("sno-primitive-value"),',
    '  value:independent(),independent:independent()};',
    'process.stdout.write(JSON.stringify(result));'
  ].join('\n');
  assert.equal(observesFunctionSource(parse(source,'commonjs')),false,
    'a primitive Storage value is not a callable-source observation');
  const transformed=obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code:source
  }],{
    mode:'sno',
    seed:'sno-node-webstorage-primitive-positive',
    strings:false,
    identifiers:true,
    properties:false
  });
  const file=transformed.files[0];
  assert.ok(file,'expected one transformed SNO entry');
  const protectedCode=String(file.code);
  assert.ok(file.metrics.bindings>=1,'expected unrelated identifier-transform yield');
  assert.ok(!protectedCode.includes('independentLocal'),'expected unrelated helper rewrite');

  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-webstorage-primitive-'));
  try {
    const packages=await writeSnoPackages(root,source,protectedCode);
    const native=runWithWebStorage(packages.nativeLauncher,packages.nativeStorage);
    const emitted=runWithWebStorage(packages.protectedLauncher,packages.protectedStorage);
    assert.equal(native.nativeDispatch,true);
    assert.equal(emitted.nativeDispatch,true);
    assert.equal(native.stored,'literal');
    assert.equal(emitted.stored,'literal');
    assert.equal(native.value,7);
    assert.equal(emitted.value,7);
    assert.equal(native.independent,7);
    assert.equal(emitted.independent,7);
    console.log(JSON.stringify({
      mode:'sno',
      node:process.versions.node,
      host:'Node --experimental-webstorage',
      nativeDispatch:native.nativeDispatch,
      stored:native.stored,
      nativeValue:native.value,
      emittedValue:emitted.value,
      renamedBindings:file.metrics.bindings,
      primitiveParity:true
    }));
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});


test('SNO Node Web Storage named-property setter exposes callable source independently of setItem',{
  skip:!supportsExperimentalWebStorage,
  timeout:30000
},async()=>{
  const source=[
    "'use strict';",
    'function inspect(){const privateLocal=41;return privateLocal;}',
    'function independent(){const independentLocal=9;return independentLocal;}',
    'localStorage.clear();',
    'localStorage.snoNamedSource=inspect;',
    'const result={stored:localStorage.getItem("snoNamedSource"),',
    '  propertyValue:localStorage.snoNamedSource,length:localStorage.length,',
    '  methodCalls:globalThis.__setItemCalls,',
    '  value:inspect(),independent:independent()};',
    'process.stdout.write(JSON.stringify(result));'
  ].join('\n');
  assert.equal(observesFunctionSource(parse(source,'commonjs')),false,
    'the current AST observer does not classify the Node Storage named-property setter');
  const transformed=obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code:source
  }],{
    mode:'sno',
    seed:'sno-node-webstorage-named-setter-source',
    strings:false,
    identifiers:true,
    properties:false
  });
  const file=transformed.files[0];
  assert.ok(file,'expected one transformed SNO entry');
  const protectedCode=String(file.code);
  assert.ok(file.metrics.bindings>=2,'expected source and unrelated private bindings to be rewritten');
  assert.ok(!protectedCode.includes('privateLocal'),'expected named-setter source body to be changed');
  assert.ok(!protectedCode.includes('independentLocal'),'expected unrelated helper rewrite');

  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-webstorage-named-'));
  try {
    const packages=await writeSnoPackages(root,source,protectedCode);
    const preloadFile=path.join(root,'preload.cjs');
    await atomicWrite(preloadFile,[
      'globalThis.__setItemCalls=0;',
      'Storage.prototype.setItem=function(){globalThis.__setItemCalls++;};'
    ].join('\n'));
    const native=runWithWebStorage(packages.nativeLauncher,packages.nativeStorage,preloadFile);
    const emitted=runWithWebStorage(packages.protectedLauncher,packages.protectedStorage,preloadFile);
    assert.equal(native.stored,native.propertyValue);
    assert.equal(emitted.stored,emitted.propertyValue);
    assert.equal(native.length,1);
    assert.equal(emitted.length,1);
    assert.equal(native.methodCalls,0,'named setter must bypass patched Storage.prototype.setItem');
    assert.equal(emitted.methodCalls,0,'named setter must bypass patched Storage.prototype.setItem');
    assert.ok(native.stored?.includes('privateLocal'));
    assert.ok(emitted.stored && !emitted.stored.includes('privateLocal'));
    assert.notEqual(native.stored,emitted.stored);
    assert.equal(native.value,41);
    assert.equal(emitted.value,41);
    assert.equal(native.independent,9);
    assert.equal(emitted.independent,9);
    console.log(JSON.stringify({
      mode:'sno',
      node:process.versions.node,
      host:'Node --experimental-webstorage',
      nativeStored:native.stored,
      emittedStored:emitted.stored,
      nativeLength:native.length,
      emittedLength:emitted.length,
      nativeValue:native.value,
      emittedValue:emitted.value,
      renamedBindings:file.metrics.bindings,
      namedSetterSourceParity:false
    }));
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});
