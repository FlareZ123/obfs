'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {traceCjsStorageSourceSinks}=require('../sims/cjs-storage-source-provenance');

const [nodeMajor,nodeMinor]=process.versions.node.split('.').map(Number);
const supportsExperimentalWebStorage=nodeMajor>22||
  nodeMajor===22&&nodeMinor>=4;

/**
 * Fixed-seed generated native Node 22 Web Storage controls for the bounded
 * read-only CJS provenance prototype. This does not compile/obfuscate code;
 * the independent SNO launcher parity fixtures are tested elsewhere.
 *
 * Each grammar family gets eight seeded alias-depth/value variants. Unknown
 * classifications intentionally admit no safe-rename conclusion. Clean Node
 * native Web Storage is an explicit host premise, not an attacker-controlled
 * realm guarantee.
 */
test('bounded CJS Storage receiver provenance agrees with native named setter on 96 variants',{
  skip:!supportsExperimentalWebStorage,timeout:120000
},async()=>{
  const seed=0x23a51b7d;
  let state=seed;
  /** @returns {number} */
  const next=()=>{
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    return state;
  };
  /** @type {{name:string,setup:string[],base:string,host:boolean,unknown?:boolean}[]} */
  const shapes=[
    {name:'global',setup:[],base:'globalThis.localStorage',host:true},
    {name:'bare',setup:[],base:'localStorage',host:true},
    {name:'factory',setup:[
      'function storageOf(){return globalThis.localStorage;}'
    ],base:'storageOf()',host:true},
    {name:'formal-return',setup:[
      'function forward(value){return value;}'
    ],base:'forward(globalThis.localStorage)',host:true},
    {name:'record-field',setup:[
      'const holder={store:globalThis.localStorage};'
    ],base:'holder.store',host:true},
    {name:'plain',setup:[],base:'{}',host:false},
    {name:'shadowed-global',setup:[
      'const localStorage={};'
    ],base:'localStorage',host:false},
    {name:'plain-record-field',setup:[
      'const holder={store:{}};'
    ],base:'holder.store',host:false},
    {name:'field-graft',setup:[
      'const holder={store:{}};','holder.store=globalThis.localStorage;'
    ],base:'holder.store',host:true,unknown:true},
    {name:'alias-graft',setup:[
      'const holder={store:{}};','const witness=holder;',
      'witness.store=globalThis.localStorage;'
    ],base:'holder.store',host:true,unknown:true},
    {name:'opaque-mutator',setup:[
      'function mutate(holder){holder.store=globalThis.localStorage;}',
      'const holder={store:{}};','mutate(holder);'
    ],base:'holder.store',host:true,unknown:true},
    {name:'opaque-provider',setup:[
      'function choose(){sideEffectThatMayChangeHost();return globalThis.localStorage;}'
    ],base:'choose()',host:true,unknown:true}
  ];
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cjs-provenance-seeded-'));
  /** @type {Record<string,number>} */
  const tallies={};
  try{
    for(let i=0;i<96;i++){
      const shape=shapes[i%shapes.length];
      const callable=(next()&1)!==0;
      const aliasDepth=next()%5;
      /** @type {string[]} */
      const pieces=[
        "'use strict';",
        'globalThis.localStorage.clear();',
        'function inspect(){const hidden=19;return hidden;}',
        ...shape.setup
      ];
      let receiver=shape.base;
      for(let j=0;j<aliasDepth;j++){
        pieces.push('const alias'+j+'='+receiver+';');
        receiver='alias'+j;
      }
      pieces.push('const receiver='+receiver+';');
      pieces.push('receiver.probe='+(callable?'inspect':'"literal"')+';');
      pieces.push('process.stdout.write(JSON.stringify({'+
        'stored:globalThis.localStorage.getItem("probe"),direct:inspect()}));');
      const source=pieces.join('\n');
      const findings=traceCjsStorageSourceSinks([
        {path:'entry.cjs',sourceType:'commonjs',code:source}
      ]);
      const last=findings.filter(item=>item.key==='probe').at(-1);
      const classification=last?.classification??'not-observed';
      tallies[classification]=(tallies[classification]??0)+1;
      const storageFile=path.join(root,'storage-'+i+'.db');
      await fs.writeFile(storageFile,'');
      const child=spawnSync(process.execPath,[
        '--experimental-webstorage','--localstorage-file='+storageFile,
        '-e',source
      ],{encoding:'utf8',timeout:15000});
      assert.equal(child.error,undefined,
        shape.name+' #'+i+' '+String(child.error??''));
      assert.equal(child.status,0,
        shape.name+' #'+i+' '+child.stderr);
      const native=JSON.parse(child.stdout);
      assert.equal(native.direct,19);
      const expected=shape.host?
        (callable?'function inspect(){const hidden=19;return hidden;}':'literal'):
        null;
      assert.equal(native.stored,expected,
        shape.name+' #'+i+' wrong native Storage dispatch');
      if(!shape.unknown){
        const expectedClassification=shape.host?
          (callable?'source-sensitive':'primitive-control'):
          (callable?'local-record':'not-observed');
        assert.equal(classification,expectedClassification,
          shape.name+' #'+i+' static/native provenance disagreement');
      }else{
        assert.ok(!['local-record','primitive-control'].includes(classification),
          shape.name+' #'+i+' cannot prove an escaped mutable receiver plain');
      }
    }
    assert.ok((tallies['source-sensitive']??0)>0);
    assert.ok((tallies['primitive-control']??0)>0);
    assert.ok((tallies['unknown-host']??0)>0);
    console.log(JSON.stringify({case:'cjs-storage-provenance-native-fuzz',
      seed,variants:96,host:'Node --experimental-webstorage',
      classes:tallies,scope:'bounded diagnostic, not production admission'}));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
