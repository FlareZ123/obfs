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

const [nodeMajor,nodeMinor]=process.versions.node.split('.').map(Number);
const supportsExperimentalWebStorage=nodeMajor>22 ||
  nodeMajor===22 && nodeMinor>=4;

/**
 * Run one CommonJS program with Node's opt-in native Web Storage implementation.
 * @param {string} entry
 * @param {string} storageFile
 * @returns {{nativeDispatch:boolean,stored:string|null,value:number,independent:number}}
 */
function runWithWebStorage(entry,storageFile) {
  const child=spawnSync(process.execPath,[
    '--experimental-webstorage',
    '--localstorage-file='+storageFile,
    entry
  ],{encoding:'utf8',timeout:15000});
  assert.equal(child.error,undefined,String(child.error??''));
  assert.equal(child.status,0,child.stderr);
  return /** @type {{nativeDispatch:boolean,stored:string|null,value:number,independent:number}} */(
    JSON.parse(child.stdout)
  );
}

test('SNO Node Web Storage exposes changed callable source through native DOMString conversion',{
  skip:!supportsExperimentalWebStorage,
  timeout:30000
},async()=>{
  const source=[
    "'use strict';",
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'function independent(){const independentLocal=7;return independentLocal;}',
    'const nativeDispatch=localStorage.setItem===Storage.prototype.setItem;',
    'localStorage.clear();',
    'localStorage.setItem("sno-source-observation",inspect);',
    'const result={nativeDispatch,',
    '  stored:localStorage.getItem("sno-source-observation"),',
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
    const nativePath=path.join(root,'native.cjs');
    const protectedPath=path.join(root,'protected.cjs');
    const nativeStorage=path.join(root,'native-storage.db');
    const protectedStorage=path.join(root,'protected-storage.db');
    await atomicWrite(nativePath,source);
    await atomicWrite(protectedPath,protectedCode);
    await fs.writeFile(nativeStorage,'');
    await fs.writeFile(protectedStorage,'');

    const native=runWithWebStorage(nativePath,nativeStorage);
    const emitted=runWithWebStorage(protectedPath,protectedStorage);

    assert.equal(native.nativeDispatch,true);
    assert.equal(emitted.nativeDispatch,true);
    assert.equal(native.value,29);
    assert.equal(emitted.value,29);
    assert.equal(native.independent,7);
    assert.equal(emitted.independent,7);
    assert.ok(native.stored?.includes('privateLocal'),'native Storage should retain original callable source');
    assert.ok(emitted.stored && !emitted.stored.includes('privateLocal'),
      'native Storage should expose the transformed callable source');
    assert.notEqual(native.stored,emitted.stored,
      'SNO identifier edits must not silently change native Storage DOMString output');

    console.log(JSON.stringify({
      mode:'sno',
      node:process.versions.node,
      host:'Node --experimental-webstorage',
      nativeStored:native.stored,
      emittedStored:emitted.stored,
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
