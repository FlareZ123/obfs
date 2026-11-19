'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {execFileSync,spawnSync}=require('node:child_process');
const {closeSync,openSync,readFileSync,renameSync,unlinkSync,writeFileSync}=require('node:fs');
const {join}=require('node:path');
const {performance}=require('node:perf_hooks');

const REPO=join(__dirname,'..');
const PROPERTY_FILE=join(REPO,'src','properties.js');
const DEFAULT_CONTROL_SHA='72fe98ac1a542bed02ef43d434876c69cff35acd';
const CONTROL_SHA=process.env.OBFS_PROOF_CONTROL_SHA||DEFAULT_CONTROL_SHA;
const ALIAS_OWNERS=Number(process.env.OBFS_PROOF_ALIAS_OWNERS||384);
const RICH_ALIASES=process.env.OBFS_PROOF_RICH_ALIASES==='true';
const DEPENDENCY_ALIASES=process.env.OBFS_PROOF_DEPENDENCY_ALIASES==='true';
const DEPENDENCY_DEPTH=Number(process.env.OBFS_PROOF_DEPENDENCY_DEPTH||192);
assert.ok(Number.isSafeInteger(ALIAS_OWNERS)&&ALIAS_OWNERS>=1&&ALIAS_OWNERS<=4096,
  'Alias owner count must be an integer from 1 to 4096');
assert.ok(Number.isSafeInteger(DEPENDENCY_DEPTH)&&DEPENDENCY_DEPTH>=1&&DEPENDENCY_DEPTH<=768,
  'Dependency depth must be an integer from 1 to 768');
assert.match(CONTROL_SHA,/^[a-f0-9]{40}$/,
  'A/B control ref must be a fully specified immutable commit SHA');
/** @type {string} */
let control;
/** @type {string} */
let originalCompiler;

/** @param {number} objects @returns {string} */
function original(objects){
  let code="'use strict';let total=0;\n";
  for(let i=0;i<objects;i++)
    code+='const bag'+i+'={k:'+(i%31)+'};'+
      'if("k" in bag'+i+')total=(total+bag'+i+'.k)|0;\n';
  return code+'module.exports=total;\n';
}

/**
 * Held-out mixed owner flows, including immutable computed keys, aliases,
 * local readers, identity forwarding, private tuples/records, and one
 * reflective refusal. All emitted candidate bytes must match the control.
 * @returns {string}
 */
function mixedSource(){
  let code="'use strict';let total=0;\n";
  for(let i=0;i<48;i++){
    const n=String(i),v=i%29;
    switch(i%7){
      case 0:
        code+='const key'+n+'="secret";const bag'+n+'={secret:'+v+'};'+
          'total=(total+bag'+n+'[key'+n+'])|0;\n';
        break;
      case 1:
        code+='const bag'+n+'={secret:'+v+'};const alias'+n+'=bag'+n+';'+
          'total=(total+alias'+n+'.secret)|0;\n';
        break;
      case 2:
        code+='const bag'+n+'={secret:'+v+'};const tuple'+n+'=[0,bag'+n+',3];'+
          'const owned'+n+'=tuple'+n+'[1];total=(total+owned'+n+'.secret)|0;\n';
        break;
      case 3:
        code+='const bag'+n+'={secret:'+v+'};const holder'+n+'={tag:0,owned:bag'+n+'};'+
          'const owned'+n+'=holder'+n+'.owned;total=(total+owned'+n+'.secret)|0;\n';
        break;
      case 4:
        code+='const bag'+n+'={secret:'+v+'};const reader'+n+'=(value)=>value.secret;'+
          'total=(total+reader'+n+'(bag'+n+'))|0;\n';
        break;
      case 5:
        code+='const bag'+n+'={secret:'+v+'};function forward'+n+'(value){return value;}'+
          'total=(total+forward'+n+'(bag'+n+').secret)|0;\n';
        break;
      default:
        code+='const bag'+n+'={secret:'+v+'};'+
          'total=(total+Object.keys(bag'+n+').includes("secret"))|0;\n';
    }
  }
  return code+'module.exports=total;\n';
}

/**
 * Dense independent owner-to-alias-to-alias chains exercise the direct edge
 * fixed-point, while preserving the original generated output byte-for-byte.
 * @param {boolean} [rich]
 * @returns {string}
 */
function aliasSource(rich=false){
  let code=rich?"'use strict';function unrelated(){return 1;}let total=unrelated();\n":
    "'use strict';let total=0;\n";
  for(let i=0;i<ALIAS_OWNERS;i++)
    code+='const bag'+i+'={secret:'+(i%31)+'};'+
      'const alias'+i+'=bag'+i+';const final'+i+'=alias'+i+';'+
      'total=(total+final'+i+'.secret)|0;\n';
  return code+'module.exports=total;\n';
}

/**
 * Reverse declaration order makes the baseline formal fixed point discover
 * only one parameter per pass, while preserving one actual private owner.
 * @returns {string}
 */
function dependencyAliasSource(){
  let code="'use strict';let total=0;\n";
  for(let i=DEPENDENCY_DEPTH;i>=0;i--){
    code+=i===DEPENDENCY_DEPTH?
      'function f'+i+'(p'+i+'){total=(total+p'+i+'.secret)|0;}\n':
      'function f'+i+'(p'+i+'){f'+(i+1)+'(p'+i+');}\n';
  }
  return code+'const root={secret:37};f0(root);module.exports=total;\n';
}

/**
 * Stress cases with almost no private owners among numerous ordinary bindings.
 * A global AST index can lose to a smaller local scan on sparse inputs.
 * @returns {string}
 */
function sparseSource(){
  let code="'use strict';let total=0;\n";
  for(let i=0;i<4096;i++)
    code+='const ordinary'+i+'='+i+';total=(total+ordinary'+i+')|0;\n';
  return code+'const tiny0={secret:17};const tiny1={secret:23};'+
    'total=(total+tiny0.secret+tiny1.secret)|0;module.exports=total;\n';
}

/** @param {string} source @returns {string} */
function sha256(source){
  return createHash('sha256').update(source).digest('hex');
}

/**
 * The sample runs in a fresh subprocess after the controlling source swap.
 * CPU and wall both measure only obfuscateFiles, not this script's process.
 * @param {number|'mixed'|'sparse'|'aliases'|'richAliases'|'dependencyAliases'} objects
 * @returns {void}
 */
function sample(objects){
  const {obfuscateFiles}=require('../src');
  const input=objects==='mixed'?mixedSource():objects==='sparse'?sparseSource():
    objects==='aliases'?aliasSource():objects==='richAliases'?aliasSource(true):
    objects==='dependencyAliases'?dependencyAliasSource():original(objects);
  const cpuStart=process.cpuUsage();
  const wallStart=performance.now();
  const emitted=obfuscateFiles([{path:'onefile.cjs',code:input,sourceType:'commonjs'}],{
    mode:'coo',seed:'own-in-onefile-'+objects,strings:false,identifiers:false
  });
  const wallMs=performance.now()-wallStart;
  const cpu=process.cpuUsage(cpuStart);
  assert.ok(objects==='mixed'?emitted.files[0].metrics.properties>=16:
    objects==='sparse'?emitted.files[0].metrics.properties===2:
    (objects==='aliases'||objects==='richAliases')?emitted.files[0].metrics.properties===ALIAS_OWNERS:
    objects==='dependencyAliases'?emitted.files[0].metrics.properties===1:
    emitted.files[0].metrics.properties===objects,'Positive field rewrite required');
  const output=/** @type {string} */ (emitted.files[0].code);
  /** @type {{exports:number|null}} */
  const module={exports:null};
  new Function('module',output)(module);
  /** @type {{exports:number|null}} */
  const native={exports:null};
  new Function('module',input)(native);
  assert.equal(module.exports,native.exports);
  console.log('PROOF_INDEX_SAMPLE '+JSON.stringify({
    objects,aliasOwners:['aliases','richAliases'].includes(String(objects))?ALIAS_OWNERS:undefined,
    dependencyDepth:objects==='dependencyAliases'?DEPENDENCY_DEPTH:undefined,
    platform:process.platform,node:process.version,
    cpuMs:(cpu.user+cpu.system)/1000,wallMs,
    properties:emitted.files[0].metrics.properties,
    sourceHash:sha256(output),sourceBytes:Buffer.byteLength(output),
    expectedChecksum:module.exports
  }));
}

/** @param {string} content @returns {void} */
function replaceAtomically(content){
  const tmp=PROPERTY_FILE+'.ab-'+process.pid+'.tmp';
  writeFileSync(tmp,content,{encoding:'utf8',flag:'wx'});
  renameSync(tmp,PROPERTY_FILE);
}

/**
 * @param {'control'|'candidate'} arm
 * @param {number|'mixed'|'sparse'|'aliases'|'richAliases'|'dependencyAliases'} objects
 * @returns {{arm:string,objects:number|'mixed'|'sparse'|'aliases'|'richAliases'|'dependencyAliases',cpuMs:number,wallMs:number,properties:number,sourceHash:string,sourceBytes:number,expectedChecksum:number}}
 */
function run(arm,objects){
  const code=arm==='control'?control:originalCompiler;
  replaceAtomically(code);
  const child=spawnSync(process.execPath,[__filename,'sample',String(objects)],{
    cwd:REPO,encoding:'utf8',timeout:600000,maxBuffer:1024*1024
  });
  assert.equal(child.status,0,child.stderr || child.stdout || String(child.error));
  const line=child.stdout.split(/\r?\n/).find(row=>row.startsWith('PROOF_INDEX_SAMPLE '));
  assert.ok(line,'Missing sample result');
  const record=JSON.parse(line.slice('PROOF_INDEX_SAMPLE '.length));
  return {arm,...record};
}

if(process.argv[2]==='sample'){
  sample(['mixed','sparse','aliases','richAliases','dependencyAliases'].includes(process.argv[3])?
    /** @type {'mixed'|'sparse'|'aliases'|'richAliases'|'dependencyAliases'} */ (process.argv[3]):Number(process.argv[3]));
}else{
  // This intentionally swaps the single compiler file, so only run in an
  // isolated CI checkout with no concurrent compiler clients.
  assert.equal(process.env.CI,'true','Paired source swap requires an isolated CI job');
  originalCompiler=readFileSync(PROPERTY_FILE,'utf8');
  control=execFileSync('git',['show',CONTROL_SHA+':src/properties.js'],{
    cwd:REPO,encoding:'utf8',maxBuffer:1024*1024
  });
  assert.notEqual(sha256(originalCompiler),sha256(control));
  const lock=PROPERTY_FILE+'.ab.lock';
  const lockFd=openSync(lock,'wx');
  /** @type {ReturnType<typeof run>[]} */
  const records=[];
  /** @type {('control'|'candidate')[]} */
  const largeArms=process.env.OBFS_PROOF_REPEAT_LARGE==='true'?
    ['candidate','control','control','candidate','candidate','control','control','candidate']:
    ['candidate','control'];
  /** @type {('control'|'candidate')[]} */
  const aliasArms=process.env.OBFS_PROOF_REPEAT_ALIASES==='true'?
    ['candidate','control','control','candidate','candidate','control','control','candidate']:
    ['candidate','control','control','candidate'];
  try{
    /** @type {[number|'mixed'|'sparse'|'aliases'|'richAliases'|'dependencyAliases',('control'|'candidate')[]][]} */
    const cases=[
      [512,['control','candidate','candidate','control']],
      [2048,largeArms],
      ['mixed',['control','candidate']],
      ['sparse',['candidate','control','control','candidate']],
      ['aliases',aliasArms]
    ];
    if(RICH_ALIASES)cases.push(['richAliases',aliasArms]);
    if(DEPENDENCY_ALIASES)cases.push(['dependencyAliases',aliasArms]);
    for(const [objects,arms] of cases){
      for(const arm of arms)records.push(run(arm,objects));
      const group=records.filter(record=>record.objects===objects);
      assert.equal(new Set(group.map(record=>record.sourceHash)).size,1,
        'Control and candidate must emit byte-identical code');
      assert.equal(new Set(group.map(record=>record.expectedChecksum)).size,1);
    }
    for(const [objects] of cases){
      const group=records.filter(record=>record.objects===objects);
      const controlRuns=group.filter(record=>record.arm==='control');
      const candidateRuns=group.filter(record=>record.arm==='candidate');
      const average=(/** @type {number[]} */ samples)=>samples.reduce((a,b)=>a+b,0)/samples.length;
      console.log('PROOF_INDEX_AB '+JSON.stringify({
        baseline:CONTROL_SHA,objects,aliasOwners:['aliases','richAliases'].includes(String(objects))?ALIAS_OWNERS:undefined,
        dependencyDepth:objects==='dependencyAliases'?DEPENDENCY_DEPTH:undefined,
        platform:process.platform,node:process.version,
        controlCpuMs:controlRuns.map(x=>x.cpuMs),
        candidateCpuMs:candidateRuns.map(x=>x.cpuMs),
        controlWallMs:controlRuns.map(x=>x.wallMs),
        candidateWallMs:candidateRuns.map(x=>x.wallMs),
        cpuRatio:average(controlRuns.map(x=>x.cpuMs))/average(candidateRuns.map(x=>x.cpuMs)),
        wallRatio:average(controlRuns.map(x=>x.wallMs))/average(candidateRuns.map(x=>x.wallMs)),
        identicalSourceHash:group[0].sourceHash,
        propertyRenames:group[0].properties,
        scope:'same CI checkout, alternating source-controlled fresh Node compiler processes'
      }));
    }
  }finally{
    replaceAtomically(originalCompiler);
    closeSync(lockFd);
    unlinkSync(lock);
  }
}
