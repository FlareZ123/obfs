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
 * @returns {{nativeDispatch?:boolean,stored?:string|null,keySource?:string|null,valueSource?:string|null,propertyValue?:string|null,length?:number,observed?:string|null,value:number,independent:number}}
 */
function runWithWebStorage(entry,storageFile,preloadFile) {
  const args=['--experimental-webstorage','--localstorage-file='+storageFile];
  if(preloadFile)args.push('--require',preloadFile);
  args.push(entry);
  const child=spawnSync(process.execPath,args,{encoding:'utf8',timeout:15000});
  assert.equal(child.error,undefined,String(child.error??''));
  assert.equal(child.status,0,child.stderr);
  return /** @type {{nativeDispatch?:boolean,stored?:string|null,keySource?:string|null,valueSource?:string|null,propertyValue?:string|null,length?:number,observed?:string|null,value:number,independent:number}} */(
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


/**
 * Build two multi-file SNO packages with one executable entry and a required helper.
 * @param {string} root
 * @param {{path:string,code:string}[]} nativeFiles
 * @param {{path:string,code:string}[]} protectedFiles
 * @param {string} entry
 * @returns {Promise<{nativeLauncher:string,protectedLauncher:string,nativeStorage:string,protectedStorage:string}>}
 */
async function writeSnoMultiFilePackages(root,nativeFiles,protectedFiles,entry) {
  const nativeRoot=path.join(root,'native-multi');
  const protectedRoot=path.join(root,'protected-multi');
  await fs.mkdir(nativeRoot,{recursive:true});
  await fs.mkdir(protectedRoot,{recursive:true});
  for(const file of nativeFiles) {
    await atomicWrite(path.join(nativeRoot,file.path),file.code);
  }
  for(const file of protectedFiles) {
    await atomicWrite(path.join(protectedRoot,file.path),file.code);
  }
  const nativeLauncher=path.join(nativeRoot,'sno-entry.cjs');
  const protectedLauncher=path.join(protectedRoot,'sno-entry.cjs');
  await atomicWrite(nativeLauncher,createSnoLauncher(nativeFiles,entry));
  await atomicWrite(protectedLauncher,createSnoLauncher(protectedFiles,entry));
  const nativeStorage=path.join(root,'native-multi-storage.db');
  const protectedStorage=path.join(root,'protected-multi-storage.db');
  await fs.writeFile(nativeStorage,'');
  await fs.writeFile(protectedStorage,'');
  return {nativeLauncher,protectedLauncher,nativeStorage,protectedStorage};
}


/**
 * Compile and run a source pair through the one-entry SNO launcher.
 * @param {string} source
 * @param {string} seed
 * @param {string} tempPrefix
 * @returns {Promise<{native:ReturnType<typeof runWithWebStorage>,emitted:ReturnType<typeof runWithWebStorage>,protectedCode:string,bindings:number,observes:boolean}>}
 */
async function runSnoDifferential(source,seed,tempPrefix) {
  const observes=observesFunctionSource(parse(source,'commonjs'));
  const transformed=obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code:source
  }],{
    mode:'sno',seed,strings:false,identifiers:true,properties:false
  });
  const file=transformed.files[0];
  assert.ok(file,'expected one transformed SNO entry');
  const protectedCode=String(file.code);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),tempPrefix));
  try {
    const packages=await writeSnoPackages(root,source,protectedCode);
    const native=runWithWebStorage(packages.nativeLauncher,packages.nativeStorage);
    const emitted=runWithWebStorage(packages.protectedLauncher,packages.protectedStorage);
    return {native,emitted,protectedCode,bindings:file.metrics.bindings,observes};
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('SNO Node Web Storage native DOMString conversion preserves observed callable source',{
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
  assert.equal(observesFunctionSource(parse(source,'commonjs')),true,
    'native Storage DOMString conversion exposes the callable source');
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
  assert.equal(file.metrics.bindings,0,'source observation must block identifier rewriting');
  assert.ok(protectedCode.includes('privateLocal'),'observed callable source must remain unchanged');
  assert.ok(protectedCode.includes('independentLocal'),'file-wide source observation must fail closed');

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
    assert.ok(emitted.keySource?.includes('privateLocal'),
      'native Storage key conversion must retain original callable source');
    assert.ok(emitted.valueSource?.includes('privateLocal'),
      'native Storage value conversion must retain original callable source');
    assert.equal(native.keySource,native.valueSource);
    assert.equal(emitted.keySource,emitted.valueSource);
    assert.equal(native.keySource,emitted.keySource,
      'SNO identifier edits must preserve native Storage DOMString output');

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
      sourceParity:true
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
    '  value:inspect(),independent:independent()};',
    'process.stdout.write(JSON.stringify(result));'
  ].join('\n');
  assert.equal(observesFunctionSource(parse(source,'commonjs')),true,
    'the Web Storage named-property setter independently stringifies callable source');
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
  assert.equal(file.metrics.bindings,0,'named setter source must veto identifier rewrites');
  assert.ok(protectedCode.includes('privateLocal'),'named setter source body must remain intact');
  assert.ok(protectedCode.includes('independentLocal'),'source observation must fail closed');

  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-webstorage-named-'));
  try {
    const packages=await writeSnoPackages(root,source,protectedCode);
    const preloadFile=path.join(root,'preload.cjs');
    await atomicWrite(preloadFile,
      "Storage.prototype.setItem=function(){throw new Error('named setter must bypass setItem');};\n");
    const native=runWithWebStorage(packages.nativeLauncher,packages.nativeStorage,preloadFile);
    const emitted=runWithWebStorage(packages.protectedLauncher,packages.protectedStorage,preloadFile);
    assert.equal(native.stored,native.propertyValue);
    assert.equal(emitted.stored,emitted.propertyValue);
    assert.equal(native.length,1);
    assert.equal(emitted.length,1);
    assert.ok(native.stored?.includes('privateLocal'));
    assert.ok(emitted.stored?.includes('privateLocal'));
    assert.equal(native.stored,emitted.stored);
    assert.equal(native.propertyValue,emitted.propertyValue);
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
      namedSetterSourceParity:true
    }));
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});


test('SNO Node Web Storage primitive named-property setter preserves identifier yield',{
  skip:!supportsExperimentalWebStorage,
  timeout:30000
},async()=>{
  const source=[
    "'use strict';",
    'function independent(){const independentLocal=9;return independentLocal;}',
    'localStorage.clear();',
    'localStorage.snoNamedSource="literal";',
    'const result={stored:localStorage.getItem("snoNamedSource"),',
    '  value:independent(),independent:independent()};',
    'process.stdout.write(JSON.stringify(result));'
  ].join('\\n');
  const pair=await runSnoDifferential(
    source,'sno-named-setter-primitive-positive','obfs-sno-named-primitive-');
  assert.equal(pair.observes,false,'inert named assignment is not source observation');
  assert.ok(pair.bindings>=1,'primitive named assignment must retain transform yield');
  assert.ok(!pair.protectedCode.includes('independentLocal'));
  assert.equal(pair.native.stored,'literal');
  assert.equal(pair.emitted.stored,'literal');
  assert.equal(pair.native.value,9);
  assert.equal(pair.emitted.value,9);
  assert.equal(pair.native.independent,9);
  assert.equal(pair.emitted.independent,9);
  console.log(JSON.stringify({mode:'sno',case:'named-property-primitive',
    observer:pair.observes,bindings:pair.bindings,stored:pair.emitted.stored,parity:true}));
});

test('SNO Node Web Storage own toString returning a primitive preserves rewrite yield',{
  skip:!supportsExperimentalWebStorage,
  timeout:30000
},async()=>{
  const source=[
    "'use strict';",
    'function inspect(){const privateLocal=43;return privateLocal;}',
    'function independent(){const independentLocal=7;return independentLocal;}',
    'inspect.toString=function(){return this===inspect?"own-string":"wrong";};',
    'localStorage.clear();',
    'localStorage.setItem("own-string",inspect);',
    'const result={stored:localStorage.getItem("own-string"),value:inspect(),independent:independent()};',
    'process.stdout.write(JSON.stringify(result));'
  ].join('\n');
  const pair=await runSnoDifferential(source,'sno-node-webstorage-own-tostring','obfs-sno-own-tostring-');
  assert.equal(pair.observes,false);
  assert.ok(pair.bindings>=2);
  assert.ok(!pair.protectedCode.includes('privateLocal'));
  assert.ok(!pair.protectedCode.includes('independentLocal'));
  assert.equal(pair.native.stored,'own-string');
  assert.equal(pair.emitted.stored,'own-string');
  assert.equal(pair.native.value,43);
  assert.equal(pair.emitted.value,43);
  assert.equal(pair.native.independent,7);
  assert.equal(pair.emitted.independent,7);
  console.log(JSON.stringify({mode:'sno',case:'own-toString-primitive',observer:pair.observes,bindings:pair.bindings,stored:pair.emitted.stored,parity:true}));
});

test('SNO Node Web Storage own Symbol.toPrimitive remains conservatively refused',{
  skip:!supportsExperimentalWebStorage,
  timeout:30000
},async()=>{
  const source=[
    "'use strict';",
    'function inspect(){const privateLocal=47;return privateLocal;}',
    'function independent(){const independentLocal=11;return independentLocal;}',
    'inspect[Symbol.toPrimitive]=function(hint){return this===inspect&&hint==="string"?"symbol-string":"wrong";};',
    'localStorage.clear();',
    'localStorage.setItem("own-symbol",inspect);',
    'const result={stored:localStorage.getItem("own-symbol"),value:inspect(),independent:independent()};',
    'process.stdout.write(JSON.stringify(result));'
  ].join('\n');
  const pair=await runSnoDifferential(source,'sno-node-webstorage-own-symbol','obfs-sno-own-symbol-');
  assert.equal(pair.observes,true);
  assert.equal(pair.bindings,0);
  assert.ok(pair.protectedCode.includes('privateLocal'));
  assert.equal(pair.native.stored,'symbol-string');
  assert.equal(pair.emitted.stored,'symbol-string');
  assert.equal(pair.native.value,47);
  assert.equal(pair.emitted.value,47);
  assert.equal(pair.native.independent,11);
  assert.equal(pair.emitted.independent,11);
  console.log(JSON.stringify({mode:'sno',case:'own-Symbol.toPrimitive',observer:pair.observes,bindings:pair.bindings,stored:pair.emitted.stored,conservativeRefusal:true}));
});

test('SNO Node Web Storage bound callable conversion does not expose target source',{
  skip:!supportsExperimentalWebStorage,
  timeout:30000
},async()=>{
  const source=[
    "'use strict';",
    'function inspect(){const privateLocal=53;return privateLocal;}',
    'function independent(){const independentLocal=13;return independentLocal;}',
    'const bound=inspect.bind(null);',
    'localStorage.clear();',
    'localStorage.setItem("bound",bound);',
    'const result={stored:localStorage.getItem("bound"),value:bound(),independent:independent()};',
    'process.stdout.write(JSON.stringify(result));'
  ].join('\n');
  const pair=await runSnoDifferential(source,'sno-node-webstorage-bound-function','obfs-sno-bound-function-');
  assert.equal(pair.observes,false);
  assert.ok(pair.bindings>=2);
  assert.ok(!pair.protectedCode.includes('privateLocal'));
  assert.ok(!pair.protectedCode.includes('independentLocal'));
  assert.ok(pair.native.stored?.includes('[native code]'));
  assert.equal(pair.native.stored,pair.emitted.stored);
  assert.equal(pair.native.value,53);
  assert.equal(pair.emitted.value,53);
  assert.equal(pair.native.independent,13);
  assert.equal(pair.emitted.independent,13);
  console.log(JSON.stringify({mode:'sno',case:'bound-function',observer:pair.observes,bindings:pair.bindings,stored:pair.emitted.stored,parity:true}));
});

test('SNO Node Web Storage patched Function.prototype.toString preserves native source',{
  skip:!supportsExperimentalWebStorage,
  timeout:30000
},async()=>{
  const source=[
    "'use strict';",
    'const nativeToString=Function.prototype.toString;',
    'Function.prototype.toString=function(){return nativeToString.call(this);};',
    'function inspect(){const privateLocal=59;return privateLocal;}',
    'function independent(){const independentLocal=17;return independentLocal;}',
    'localStorage.clear();',
    'localStorage.setItem("patched",inspect);',
    'const result={stored:localStorage.getItem("patched"),value:inspect(),independent:independent()};',
    'process.stdout.write(JSON.stringify(result));'
  ].join('\n');
  const pair=await runSnoDifferential(source,'sno-node-webstorage-patched-function-tostring','obfs-sno-patched-tostring-');
  assert.equal(pair.observes,true);
  assert.equal(pair.bindings,0);
  assert.ok(pair.protectedCode.includes('privateLocal'));
  assert.ok(pair.native.stored?.includes('privateLocal'));
  assert.equal(pair.native.stored,pair.emitted.stored);
  assert.equal(pair.native.value,59);
  assert.equal(pair.emitted.value,59);
  assert.equal(pair.native.independent,17);
  assert.equal(pair.emitted.independent,17);
  console.log(JSON.stringify({mode:'sno',case:'patched-Function.prototype.toString',observer:pair.observes,bindings:pair.bindings,sourceParity:true}));
});

test('SNO Node Web Storage hook that reads native source then returns a primitive remains source-observing',{
  skip:!supportsExperimentalWebStorage,
  timeout:30000
},async()=>{
  const source=[
    "'use strict';",
    'const nativeToString=Function.prototype.toString;',
    'function inspect(){const privateLocal=61;return privateLocal;}',
    'function independent(){const independentLocal=19;return independentLocal;}',
    'inspect.toString=function(){globalThis.__snoObservedSource=nativeToString.call(this);return "discarded";};',
    'localStorage.clear();',
    'localStorage.setItem("hook",inspect);',
    'const result={stored:localStorage.getItem("hook"),observed:globalThis.__snoObservedSource,',
    '  value:inspect(),independent:independent()};',
    'process.stdout.write(JSON.stringify(result));'
  ].join('\n');
  const pair=await runSnoDifferential(source,'sno-node-webstorage-hook-observes-source','obfs-sno-hook-observes-');
  assert.equal(pair.observes,true);
  assert.equal(pair.bindings,0);
  assert.ok(pair.protectedCode.includes('privateLocal'));
  assert.equal(pair.native.stored,'discarded');
  assert.equal(pair.emitted.stored,'discarded');
  assert.ok(pair.native.observed?.includes('privateLocal'));
  assert.equal(pair.native.observed,pair.emitted.observed);
  assert.equal(pair.native.value,61);
  assert.equal(pair.emitted.value,61);
  assert.equal(pair.native.independent,19);
  assert.equal(pair.emitted.independent,19);
  console.log(JSON.stringify({mode:'sno',case:'hook-reads-source-then-returns-primitive',observer:pair.observes,bindings:pair.bindings,stored:pair.emitted.stored,observedSource:pair.emitted.observed,sourceParity:true}));
});


test('SNO Node Web Storage shadowed Symbol spelling is not a well-known coercion symbol',{
  skip:!supportsExperimentalWebStorage,
  timeout:30000
},async()=>{
  const source=[
    "'use strict';",
    'const Symbol={toPrimitive:"toPrimitive"};',
    'function inspect(){const privateLocal=67;return privateLocal;}',
    'function independent(){const independentLocal=23;return independentLocal;}',
    'inspect[Symbol.toPrimitive]=function(){return "fake-symbol-string";};',
    'localStorage.clear();',
    'localStorage.setItem("shadowed-symbol",inspect);',
    'const result={stored:localStorage.getItem("shadowed-symbol"),',
    '  value:inspect(),independent:independent()};',
    'process.stdout.write(JSON.stringify(result));'
  ].join('\n');
  const pair=await runSnoDifferential(source,'sno-node-webstorage-shadowed-symbol','obfs-sno-shadowed-symbol-');
  assert.equal(pair.observes,true,
    'a local Symbol binding must not be resolved as the realm well-known Symbol');
  assert.equal(pair.bindings,0);
  assert.ok(pair.protectedCode.includes('privateLocal'));
  assert.ok(pair.native.stored?.includes('privateLocal'));
  assert.equal(pair.native.stored,pair.emitted.stored);
  assert.equal(pair.native.value,67);
  assert.equal(pair.emitted.value,67);
  assert.equal(pair.native.independent,23);
  assert.equal(pair.emitted.independent,23);
  console.log(JSON.stringify({mode:'sno',case:'shadowed-Symbol-not-well-known',observer:pair.observes,bindings:pair.bindings,sourceParity:true}));
});


test('SNO Node Web Storage immutable Symbol.toPrimitive alias remains conservatively refused',{
  skip:!supportsExperimentalWebStorage,
  timeout:30000
},async()=>{
  const source=[
    "'use strict';",
    'const toPrimitiveKey=Symbol.toPrimitive;',
    'function inspect(){const privateLocal=71;return privateLocal;}',
    'function independent(){const independentLocal=29;return independentLocal;}',
    'inspect[toPrimitiveKey]=function(hint){return hint==="string"?"alias-symbol-string":"wrong";};',
    'localStorage.clear();',
    'localStorage.setItem("alias-symbol",inspect);',
    'const result={stored:localStorage.getItem("alias-symbol"),',
    '  value:inspect(),independent:independent()};',
    'process.stdout.write(JSON.stringify(result));'
  ].join('\n');
  const pair=await runSnoDifferential(source,'sno-node-webstorage-symbol-alias','obfs-sno-symbol-alias-');
  assert.equal(pair.observes,true,
    'the current symbol-key alias resolver does not prove @@toPrimitive');
  assert.equal(pair.bindings,0);
  assert.ok(pair.protectedCode.includes('privateLocal'));
  assert.equal(pair.native.stored,'alias-symbol-string');
  assert.equal(pair.emitted.stored,'alias-symbol-string');
  assert.equal(pair.native.value,71);
  assert.equal(pair.emitted.value,71);
  assert.equal(pair.native.independent,29);
  assert.equal(pair.emitted.independent,29);
  console.log(JSON.stringify({mode:'sno',case:'immutable-Symbol.toPrimitive-alias',observer:pair.observes,bindings:pair.bindings,stored:pair.emitted.stored,conservativeRefusal:true}));
});


test('SNO Node sessionStorage native DOMString conversion preserves callable source and runtime values',{
  skip:!supportsExperimentalWebStorage,
  timeout:30000
},async()=>{
  const source=[
    "'use strict';",
    'function inspect(){const privateLocal=73;return privateLocal;}',
    'function independent(){const independentLocal=31;return independentLocal;}',
    'const nativeDispatch=sessionStorage.setItem===Storage.prototype.setItem;',
    'sessionStorage.clear();',
    'sessionStorage.setItem("session-source",inspect);',
    'const result={nativeDispatch,stored:sessionStorage.getItem("session-source"),',
    '  value:inspect(),independent:independent()};',
    'process.stdout.write(JSON.stringify(result));'
  ].join('\n');
  const pair=await runSnoDifferential(source,'sno-node-sessionstorage-source','obfs-sno-sessionstorage-');
  assert.equal(pair.observes,true);
  assert.equal(pair.bindings,0);
  assert.ok(pair.protectedCode.includes('privateLocal'));
  assert.ok(pair.protectedCode.includes('independentLocal'));
  assert.equal(pair.native.nativeDispatch,true);
  assert.equal(pair.emitted.nativeDispatch,true);
  assert.ok(pair.native.stored?.includes('privateLocal'));
  assert.ok(pair.emitted.stored?.includes('privateLocal'));
  assert.equal(pair.native.stored,pair.emitted.stored);
  assert.equal(pair.native.value,73);
  assert.equal(pair.emitted.value,73);
  assert.equal(pair.native.independent,31);
  assert.equal(pair.emitted.independent,31);
  console.log(JSON.stringify({mode:'sno',case:'sessionStorage-native-setItem',observer:pair.observes,bindings:pair.bindings,nativeDispatch:pair.native.nativeDispatch,sourceParity:true}));
});


test('SNO Node Web Storage cross-file factory return preserves helper callable source through one entrypoint',{
  skip:!supportsExperimentalWebStorage,
  timeout:30000
},async()=>{
  const entrySource=[
    "'use strict';",
    "const getCallback=require('./helper.cjs');",
    'const inspect=getCallback();',
    'function independent(){const independentLocal=5;return independentLocal;}',
    'localStorage.clear();',
    'localStorage.setItem("cross-file-source",inspect);',
    'const result={stored:localStorage.getItem("cross-file-source"),',
    '  value:inspect(),independent:independent()};',
    'process.stdout.write(JSON.stringify(result));'
  ].join('\n');
  const helperSource=[
    "'use strict';",
    'module.exports=function getCallback(){',
    '  function inspect(){const privateLocal=83;return privateLocal;}',
    '  return inspect;',
    '};'
  ].join('\n');
  assert.equal(observesFunctionSource(parse(entrySource,'commonjs')),true);
  assert.equal(observesFunctionSource(parse(helperSource,'commonjs')),false);
  /** @type {{path:string,sourceType:'commonjs',code:string}[]} */
  const inputFiles=[
    {path:'entry.cjs',sourceType:'commonjs',code:entrySource},
    {path:'helper.cjs',sourceType:'commonjs',code:helperSource}
  ];
  const transformed=obfuscateFiles(inputFiles,{
    mode:'sno',
    seed:'sno-node-webstorage-cross-file-factory-return',
    strings:false,
    identifiers:true,
    properties:false
  });
  const entryFile=transformed.files.find(file=>file.path==='entry.cjs');
  const helperFile=transformed.files.find(file=>file.path==='helper.cjs');
  assert.ok(entryFile,'expected one SNO entry file');
  assert.ok(helperFile,'expected one SNO helper file');
  const protectedHelper=String(helperFile.code);
  assert.equal(entryFile.metrics.bindings,0,'entry source observation must block file-group rewriting');
  assert.equal(helperFile.metrics.bindings,0,'observed returned function source must not be rewritten');
  assert.ok(protectedHelper.includes('privateLocal'),'returned callable source must remain unchanged');

  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-webstorage-cross-file-'));
  try {
    const packages=await writeSnoMultiFilePackages(
      root,
      [{path:'entry.cjs',code:entrySource},{path:'helper.cjs',code:helperSource}],
      transformed.files.map(file=>({path:file.path,code:String(file.code)})),
      'entry.cjs'
    );
    const native=runWithWebStorage(packages.nativeLauncher,packages.nativeStorage);
    const emitted=runWithWebStorage(packages.protectedLauncher,packages.protectedStorage);
    assert.ok(native.stored?.includes('privateLocal'));
    assert.ok(emitted.stored?.includes('privateLocal'));
    assert.equal(native.stored,emitted.stored);
    assert.equal(native.value,83);
    assert.equal(emitted.value,83);
    assert.equal(native.independent,5);
    assert.equal(emitted.independent,5);
    console.log(JSON.stringify({
      mode:'sno',
      host:'Node --experimental-webstorage',
      entrypoint:'entry.cjs',
      helper:'helper.cjs',
      flow:'helper factory -> returned callable -> Storage.setItem',
      nativeStored:native.stored,
      emittedStored:emitted.stored,
      helperBindings:helperFile.metrics.bindings,
      nativeValue:native.value,
      emittedValue:emitted.value,
      unrelatedHelper:emitted.independent,
      sourceParity:true
    }));
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});
