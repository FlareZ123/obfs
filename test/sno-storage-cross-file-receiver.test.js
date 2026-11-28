'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles,createSnoLauncher}=require('../src');

const [nodeMajor,nodeMinor]=process.versions.node.split('.').map(Number);
const supportsExperimentalWebStorage=nodeMajor>22||
  nodeMajor===22&&nodeMinor>=4;

/** @typedef {{path:string,sourceType:'commonjs',code:string}} File */
/**
 * Run native and compiler-emitted two-file CommonJS modules through the real
 * single-entry SNO hash-checking launcher, not a direct Function/eval wrapper.
 * Both arms get their own clean native Node Web Storage backing store.
 * @param {string} entry
 * @param {string} helper
 * @param {string} seed
 * @returns {Promise<{native:{stored:string,propertyValue:string,value?:number,independent?:number},emitted:{stored:string,propertyValue:string,value?:number,independent?:number},files:ReturnType<typeof obfuscateFiles>['files']}>}
 */
async function runPair(entry,helper,seed){
  /** @type {File[]} */
  const originals=[
    {path:'entry.cjs',sourceType:'commonjs',code:entry},
    {path:'helper.cjs',sourceType:'commonjs',code:helper}
  ];
  const transformed=obfuscateFiles(originals,{
    mode:'sno',seed,strings:false,identifiers:true,properties:false
  });
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-storage-host-receiver-'));
  try{
    /**
     * @param {'native'|'emitted'} arm
     * @param {{path:string,code:string}[]} sources
     * @returns {Promise<{stored:string,propertyValue:string,value?:number,independent?:number}>}
     */
    async function execute(arm,sources){
      const dir=path.join(root,arm);
      await fs.mkdir(dir,{recursive:true});
      for(const file of sources)await fs.writeFile(path.join(dir,file.path),file.code);
      const boot=path.join(dir,'sno-entry.cjs');
      await fs.writeFile(boot,createSnoLauncher(sources,'entry.cjs'));
      const storageFile=path.join(root,arm+'-webstorage.db');
      await fs.writeFile(storageFile,'');
      const child=spawnSync(process.execPath,[
        '--experimental-webstorage','--localstorage-file='+storageFile,boot
      ],{encoding:'utf8',timeout:15000});
      assert.equal(child.error,undefined,String(child.error??''));
      assert.equal(child.status,0,child.stderr);
      return /** @type {{stored:string,propertyValue:string,value?:number,independent?:number}} */ (JSON.parse(child.stdout));
    }
    const native=await execute('native',originals);
    const emitted=await execute('emitted',transformed.files.map(file=>({
      path:file.path,code:String(file.code)
    })));
    return {native,emitted,files:transformed.files};
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('SNO interfile Storage factory-return named setter requires exact callable source',{
  skip:!supportsExperimentalWebStorage,timeout:30000
},async()=>{
  const helper=[
    "'use strict';",
    'exports.storageOf=function storageOf(){return globalThis.localStorage;};',
    'exports.makeInspector=function makeInspector(){',
    '  function inspect(){const sourceSensitive=97;return sourceSensitive;}',
    '  return inspect;',
    '};'
  ].join('\n');
  const entry=[
    "'use strict';",
    "const {storageOf,makeInspector}=require('./helper.cjs');",
    'const storage=storageOf();',
    'const inspect=makeInspector();',
    'storage.namedInterfileSource=inspect;',
    'const result={stored:storage.getItem("namedInterfileSource"),',
    '  propertyValue:storage.namedInterfileSource,value:inspect()};',
    'process.stdout.write(JSON.stringify(result));'
  ].join('\n');
  const altered=helper.replaceAll('sourceSensitive','differentName');
  const original=await runPair(entry,helper,'sno-storage-factory-return-source');
  const nativeMutation=await runPair(entry,altered,'sno-storage-factory-return-mutation');
  assert.equal(original.native.value,97);
  assert.equal(nativeMutation.native.value,97);
  assert.equal(original.native.stored,original.native.propertyValue);
  assert.equal(nativeMutation.native.stored,nativeMutation.native.propertyValue);
  assert.notEqual(original.native.stored,nativeMutation.native.stored,
    'native interfile named setter must reveal exact callback source spelling');
  assert.deepEqual(original.emitted,original.native,
    'SNO must preserve exact Storage named setter output through factory-returned host receiver');
});

test('SNO interfile Storage factory-return primitive setter retains safe private work',{
  skip:!supportsExperimentalWebStorage,timeout:30000
},async()=>{
  const helper=[
    "'use strict';",
    'exports.storageOf=function storageOf(){return globalThis.localStorage;};',
    'exports.independent=function independent(){const independentLocal=13;return independentLocal;};'
  ].join('\n');
  const entry=[
    "'use strict';",
    "const {storageOf,independent}=require('./helper.cjs');",
    'const storage=storageOf();',
    'storage.namedInterfilePrimitive="literal";',
    'const result={stored:storage.getItem("namedInterfilePrimitive"),',
    '  propertyValue:storage.namedInterfilePrimitive,independent:independent()};',
    'process.stdout.write(JSON.stringify(result));'
  ].join('\n');
  const pair=await runPair(entry,helper,'sno-storage-factory-return-primitive');
  assert.equal(pair.native.stored,'literal');
  assert.equal(pair.native.propertyValue,'literal');
  assert.equal(pair.native.independent,13);
  assert.deepEqual(pair.emitted,pair.native);
  const protectedHelper=pair.files.find(file=>file.path==='helper.cjs');
  assert.ok(protectedHelper);
  assert.ok(protectedHelper.metrics.bindings>=1);
  assert.ok(!String(protectedHelper.code).includes('independentLocal'),
    'unrelated helper function must be genuinely rewritten');
});
