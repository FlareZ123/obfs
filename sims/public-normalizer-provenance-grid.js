'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {normalizePublicFields}=require('./public-token-normalizer');

/** @typedef {{name:string,tail:(field:string)=>string}} Case */
/**
 * Public emitted-shaped names are manufactured without using the obfuscator.
 * Every graph contains a locally owned literal and a separately supplied host
 * capability with the very same spelling, so an attacker must distinguish
 * the receiver origin rather than relying on token shape alone.
 * @type {Case[]}
 */
const CASES=[
  {name:'owned-direct',tail:k=>'module.exports=[owner.'+k+'];'},
  {name:'owned-alias-one',tail:k=>'const a=owner;module.exports=[a.'+k+'];'},
  {name:'owned-alias-two',tail:k=>'const a=owner,b=a;module.exports=[b.'+k+'];'},
  {name:'owned-parameter',tail:k=>
    'function read(input){return input.'+k+';}module.exports=[read(owner)];'},
  {name:'owned-call-result',tail:k=>
    'const identity=x=>x;module.exports=[identity(owner).'+k+'];'},
  {name:'owned-destructure',tail:k=>
    'const {'+k+':item}=owner;module.exports=[item];'},
  {name:'owned-record-path',tail:k=>
    'const arg={payload:owner};module.exports=[arg.payload.'+k+'];'},
  {name:'owned-reassigned-host-first',tail:k=>
    'let a=HOST;a=owner;module.exports=[a.'+k+'];'},
  {name:'external-direct',tail:k=>'module.exports=[HOST.'+k+'];'},
  {name:'external-alias-one',tail:k=>
    'const a=HOST;module.exports=[a.'+k+'];'},
  {name:'external-alias-two',tail:k=>
    'const a=HOST,b=a;module.exports=[b.'+k+'];'},
  {name:'external-nested',tail:k=>
    'module.exports=[HOST.api.'+k+'];'},
  {name:'external-destructure',tail:k=>
    'const {'+k+':item}=HOST;module.exports=[item];'},
  {name:'external-parameter',tail:k=>
    'function read(input){return input.'+k+';}module.exports=[read(HOST)];'},
  {name:'external-alias-closure',tail:k=>
    'const a=HOST;function read(){return a.'+k+';}module.exports=[read()];'},
  {name:'external-reassigned-owner-first',tail:k=>
    'let a=owner;a=HOST;module.exports=[a.'+k+'];'},
  {name:'external-computed-key',tail:k=>
    'module.exports=[HOST["'+k+'"]];'},
  {name:'external-record-path',tail:k=>
    'const arg={payload:HOST};module.exports=[arg.payload.'+k+'];'},
  {name:'external-nested-destructure',tail:k=>
    'const {api:{'+k+':item}}=HOST;module.exports=[item];'}
];

/**
 * @param {string} code
 * @param {string} field
 * @param {number} seed
 * @returns {string}
 */
function execute(code,field,seed){
  const module={exports:null};
  const HOST={ [field]:31+seed,api:{[field]:47+seed} };
  vm.runInNewContext(code,{module,HOST},{timeout:1000});
  return JSON.stringify(module.exports);
}

/**
 * A bounded source-only attack quality grid. It is deliberately an attacker
 * falsification study, not a test of compiler-emitted code, original key
 * recovery, runtime extraction, source secrecy, or the 2.5x compute budget.
 * @param {number} [seeds]
 * @returns {{seeds:number,shapes:number,cases:number,naiveMatches:number,guardedMatches:number,rows:{name:string,seed:number,naive:boolean,guarded:boolean}[]}}
 */
function runGrid(seeds=4){
  assert.ok(Number.isInteger(seeds)&&seeds>=1&&seeds<=64);
  /** @type {{name:string,seed:number,naive:boolean,guarded:boolean}[]} */
  const rows=[];
  for(let seed=0;seed<seeds;seed++){
    const field='_p'+(seed+1).toString(16).padStart(12,'0');
    for(const example of CASES){
      const code='const owner={'+field+':'+(17+seed)+'};'+example.tail(field);
      const files=[{path:'fixture.cjs',sourceType:/** @type {const} */('commonjs'),code}];
      const baseline=execute(code,field,seed);
      const naive=normalizePublicFields(files);
      const guarded=normalizePublicFields(files,{preserveFreeMemberReceivers:true});
      assert.equal(naive.properties,1);
      assert.equal(guarded.properties,1);
      rows.push({name:example.name,seed,
        naive:execute(naive.files[0].code,field,seed)===baseline,
        guarded:execute(guarded.files[0].code,field,seed)===baseline});
    }
  }
  return {seeds,shapes:CASES.length,cases:rows.length,
    naiveMatches:rows.filter(row=>row.naive).length,
    guardedMatches:rows.filter(row=>row.guarded).length,
    rows};
}

if(require.main===module){
  const result=runGrid();
  process.stdout.write('PUBLIC_NORMALIZER_PROVENANCE_GRID '+
    JSON.stringify({node:process.version,platform:process.platform,...result})+'\n');
}
module.exports={CASES,runGrid};
