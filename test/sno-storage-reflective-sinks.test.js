'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles,createSnoLauncher}=require('../src');

const [nodeMajor,nodeMinor]=process.versions.node.split('.').map(Number);
const supportsExperimentalWebStorage=nodeMajor>22||nodeMajor===22&&nodeMinor>=4;

/**
 * Execute native and compiled one-entry SNO packages with actual Node Web
 * Storage and independent backing databases. No eval/new Function shortcut.
 * @param {string} source
 * @param {string} seed
 * @returns {Promise<{native:{stored:string,propertyValue:string,value:number,independent:number},emitted:{stored:string,propertyValue:string,value:number,independent:number},code:string,bindings:number}>}
 */
async function runPair(source,seed){
  const result=obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code:source
  }],{mode:'sno',seed,strings:false,identifiers:true,properties:false});
  const file=result.files[0];
  assert.ok(file);
  const code=String(file.code);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-native-reflective-sinks-'));
  try{
    /**
     * @param {'native'|'emitted'} mode
     * @param {string} sourceText
     * @returns {Promise<{stored:string,propertyValue:string,value:number,independent:number}>}
     */
    async function run(mode,sourceText){
      const dir=path.join(root,mode);
      await fs.mkdir(dir,{recursive:true});
      await fs.writeFile(path.join(dir,'entry.cjs'),sourceText);
      const boot=path.join(dir,'sno-entry.cjs');
      await fs.writeFile(boot,
        createSnoLauncher([{path:'entry.cjs',code:sourceText}],'entry.cjs'));
      const storage=path.join(root,mode+'-storage.db');
      await fs.writeFile(storage,'');
      const child=spawnSync(process.execPath,[
        '--experimental-webstorage','--localstorage-file='+storage,boot
      ],{encoding:'utf8',timeout:15000});
      assert.equal(child.error,undefined,String(child.error??''));
      assert.equal(child.status,0,child.stderr);
      return /** @type {{stored:string,propertyValue:string,value:number,independent:number}} */ (JSON.parse(child.stdout));
    }
    const native=await run('native',source);
    const emitted=await run('emitted',code);
    return {native,emitted,code,bindings:file.metrics.bindings};
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/** @type {ReadonlyArray<readonly [string,string]>} */
const reflectiveWriters=[
  ['Reflect.set','Reflect.set(localStorage,"nativeReflectValue",inspect);'],
  ['Object.assign','Object.assign(localStorage,{nativeReflectValue:inspect});'],
  ['Object.defineProperty','Object.defineProperty(localStorage,"nativeReflectValue",'+
    '{value:inspect,writable:true,enumerable:true,configurable:true});']
];

for(const [name,statement] of reflectiveWriters){
  test('SNO native Storage '+name+' callback-source exact output parity',{
    skip:!supportsExperimentalWebStorage,timeout:30000
  },async()=>{
    const source=[
      "'use strict';",
      'function inspect(){const sourceSensitive=47;return sourceSensitive;}',
      'function independent(){const independentLocal=9;return independentLocal;}',
      'localStorage.clear();',
      statement,
      'const result={stored:localStorage.getItem("nativeReflectValue"),',
      'propertyValue:localStorage.nativeReflectValue,',
      'value:inspect(),independent:independent()};',
      'process.stdout.write(JSON.stringify(result));'
    ].join('\n');
    const nativeMutation=source.replaceAll('sourceSensitive','differentName');
    const pair=await runPair(source,'sno-native-reflective-'+name);
    const mutated=await runPair(nativeMutation,'sno-native-reflective-mutated-'+name);
    assert.equal(pair.native.value,47);
    assert.equal(mutated.native.value,47);
    assert.equal(pair.native.independent,9);
    assert.equal(mutated.native.independent,9);
    assert.equal(pair.native.stored,pair.native.propertyValue);
    assert.ok(pair.native.stored.includes('sourceSensitive'));
    assert.notEqual(pair.native.stored,mutated.native.stored,
      'native reflective Storage sink must expose exact lexical source');
    assert.deepEqual(pair.emitted,pair.native,
      'SNO native Storage reflective setter must preserve exact source text');
  });
}

for(const [name,statement] of reflectiveWriters){
  test('SNO native Storage '+name+' primitive-value parity and yield diagnostic',{
    skip:!supportsExperimentalWebStorage,timeout:30000
  },async()=>{
    const safe=statement.replace('inspect','"literal"');
    const source=[
      "'use strict';",
      'function independent(){const independentLocal=9;return independentLocal;}',
      'localStorage.clear();',
      safe,
      'const result={stored:localStorage.getItem("nativeReflectValue"),',
      'propertyValue:localStorage.nativeReflectValue,',
      'value:9,independent:independent()};',
      'process.stdout.write(JSON.stringify(result));'
    ].join('\n');
    const pair=await runPair(source,'sno-native-reflective-primitive-'+name);
    assert.equal(pair.native.stored,'literal');
    assert.equal(pair.native.propertyValue,'literal');
    assert.deepEqual(pair.emitted,pair.native);
    // An unknown reflective host operation may validly induce conservative
    // refusal. Record, but do not mandate, non-source-observing work.
    console.log(JSON.stringify({sink:name,case:'primitive-reflective',
      bindings:pair.bindings,rewroteIndependent:!pair.code.includes('independentLocal'),
      parity:true}));
  });
}
