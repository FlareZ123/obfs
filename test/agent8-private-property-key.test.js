'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {readArgs}=require('../src/cli');
const {recoverNamedEsmPropertySpellings}=require('../sims/public-seed-property-dictionary');
const {neutralizePublishedProperties}=require('../sims/public-property-neutralizer');

const PUBLIC_SEED='public-pinned-configuration-seed';
const DICTIONARY=['secretField','otherField','sessionMark',
  ...Array.from({length:4096},(_,i)=>'propertyCandidate'+i)];
/** @typedef {{path:string,sourceType:'module',code:string}} File */
/** @type {File[]} */
const FILES=[
  {path:'state.mjs',sourceType:'module',
    code:'export const state={secretField:41,otherField:13,sessionMark:7};'},
  {path:'entry.mjs',sourceType:'module',
    code:'import {state} from "./state.mjs";console.log(JSON.stringify([state.secretField,state.otherField,state.sessionMark]));'}
];

/**
 * Launch real Node ESM or CLI. The private key is passed through an explicit
 * environment variable, never a positional argument.
 * @param {string} executable
 * @param {string[]} args
 * @param {Record<string,string>} [env]
 * @returns {{status:number|null,stdout:string,stderr:string}}
 */
function run(executable,args,env={}){
  const child=spawnSync(process.execPath,[executable,...args],{
    encoding:'utf8',timeout:15000,
    env:{...process.env,...env}
  });
  assert.equal(child.error,undefined,child.error?.message);
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

for(const mode of /** @type {('coo'|'sno'|'sco')[]} */ (['coo','sno','sco'])){
  test('secret property key yields reproducible private names and defeats public-seed dictionary: '+mode,async()=>{
    const key=randomBytes(32).toString('hex');
    const otherKey=randomBytes(32).toString('hex');
    const opts={mode,closedWorld:true,
      seed:PUBLIC_SEED,properties:true,identifiers:false,strings:false};
    const baseline=obfuscateFiles(FILES,opts);
    const a=obfuscateFiles(FILES,{...opts,experimentalPrivatePropertyKey:key});
    const b=obfuscateFiles(FILES,{...opts,experimentalPrivatePropertyKey:key});
    const c=obfuscateFiles(FILES,{...opts,experimentalPrivatePropertyKey:otherKey});
    assert.equal(a.crossFile.properties,3);
    assert.deepEqual(a.files,b.files,
      'Same hidden 256-bit key and public seed must yield identical artifacts');
    assert.notDeepEqual(a.files,c.files,
      'Rotating the hidden key must change the emitted property mappings');
    assert.equal(a.seed,PUBLIC_SEED,'Original build metadata remains public');
    for(const output of [a,b,c]){
      assert.ok(!JSON.stringify(output).includes(key),
        'No private key bytes may appear in the returned compiler output');
      assert.deepEqual(output.files.map(f=>Buffer.byteLength(f.code)),
        baseline.files.map(f=>Buffer.byteLength(f.code)));
    }
    /** @param {ReturnType<typeof obfuscateFiles>} output @returns {File[]} */
    const textFiles=output=>output.files.map(file=>({
      path:file.path,sourceType:'module',
      code:/** @type {string} */(file.code)
    }));
    const knownSeedBaseline=recoverNamedEsmPropertySpellings(textFiles(baseline),{
      seed:PUBLIC_SEED,dictionary:DICTIONARY
    });
    assert.equal(knownSeedBaseline.recovered.size,3);
    const attempted=recoverNamedEsmPropertySpellings(textFiles(a),{
      seed:PUBLIC_SEED,dictionary:DICTIONARY
    });
    assert.equal(attempted.targets,3);
    assert.equal(attempted.recovered.size,0,
      'Public build seed alone must not invert privately keyed digest fields');
    const attacked=neutralizePublishedProperties(textFiles(a));
    assert.equal(attacked.replacedTokens,3,
      'Unknown private key does not prevent static functional reconstruction');
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-keyed-native-'));
    try{
      for(const [label,graph] of [
        ['native',FILES],['keyed',textFiles(a)],['neutral',attacked.files]
      ]) {
        for(const file of graph)await atomicWrite(path.join(root,label,file.path),file.code);
      }
      const original=run(path.join(root,'native','entry.mjs'),[]);
      assert.equal(original.stdout,'[41,13,7]\n');
      assert.deepEqual(run(path.join(root,'keyed','entry.mjs'),[]),original);
      assert.deepEqual(run(path.join(root,'neutral','entry.mjs'),[]),original);
    }finally {await fs.rm(root,{recursive:true,force:true});}
    process.stdout.write('SECRET_KEYED_PROPERTY_RECOVERY '+JSON.stringify({
      mode,properties:3,hiddenKeyBits:256,publicSeedKnown:true,
      sameKeyReproducible:true,rotatedKeyDifferent:true,
      publicSeedOriginalNamesRecovered:attempted.recovered.size,
      unknownKeyNeutralizedFields:attacked.replacedTokens,
      publishedSeedUnchanged:true,nativeBehaviorPreserved:true,
      limits:'original name secrecy only, not code confidentiality or runtime tamper protection'
    })+'\n');
  });
}

test('secret-keyed private naming validates key length and rejects conflicting modes',()=>{
  const opts={mode:/** @type {'coo'} */('coo'),closedWorld:true,
    experimentalPrivatePropertyKey:'bad'};
  assert.throws(()=>obfuscateFiles(FILES,opts),/requires exactly 32 bytes/u);
  assert.throws(()=>obfuscateFiles(FILES,{
    ...opts,experimentalPrivatePropertyKey:'00'.repeat(32),
    experimentalEntropyPropertyNames:true
  }),/Choose either/u);
});

test('COO CLI uses environment-only secret key and produces reproducible output',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-property-cli-'));
  try{
    const input=path.join(root,'input'),outA=path.join(root,'a'),
      outB=path.join(root,'b'),outC=path.join(root,'c');
    await fs.mkdir(input);
    for(const file of FILES)await atomicWrite(path.join(input,file.path),file.code);
    const envName='OBFS_AGENT8_TEST_PROPERTY_SECRET';
    const key=randomBytes(32).toString('hex'),rotated=randomBytes(32).toString('hex');
    const opts=['--root',input,'--entry','entry.mjs','--closed-world',
      '--seed',PUBLIC_SEED,'--property-key-env',envName];
    for(const [out,secret] of [[outA,key],[outB,key],[outC,rotated]]){
      const built=run(path.join(__dirname,'../bin/coo.js'),[
        ...opts,'--out',out
      ],{[envName]:secret});
      assert.equal(built.status,0,built.stderr);
      assert.doesNotMatch(built.stdout+''+built.stderr,new RegExp(secret,'u'),
        'CLI must not print the environment secret');
      const executed=run(path.join(out,'entry.mjs'),[]);
      assert.equal(executed.status,0,executed.stderr);
      assert.equal(executed.stdout,'[41,13,7]\n');
    }
    const a=await fs.readFile(path.join(outA,'state.mjs'),'utf8'),
      b=await fs.readFile(path.join(outB,'state.mjs'),'utf8'),
      c=await fs.readFile(path.join(outC,'state.mjs'),'utf8');
    assert.equal(a,b,'Same env key, same seed -> reproducible exact ESM output');
    assert.notEqual(a,c,'Rotated env key -> different emitted ESM property names');
    assert.ok(!a.includes(key));
    const missing=run(path.join(__dirname,'../bin/coo.js'),[
      ...opts,'--out',path.join(root,'missing')
    ],{[envName]:'not-a-key'});
    assert.notEqual(missing.status,0);
    assert.match(missing.stderr,/64-hex-character secret/u);
    assert.match(missing.stderr,/property-key-env/u);
  }finally {await fs.rm(root,{recursive:true,force:true});}
});

test('property-key CLI validates argument and prohibits SCO silent no-op',()=>{
  const standard=['--root','.','--entry','entry.mjs'];
  assert.equal(readArgs([...standard,'--property-key-env','EXAMPLE_KEY'])
    .experimentalPropertyKeyEnv,'EXAMPLE_KEY');
  assert.throws(()=>readArgs([...standard,'--property-key-env','a.b']),
    /valid environment variable/u);
  const rejected=run(path.join(__dirname,'../bin/sco.js'),[
    ...standard,'--property-key-env','EXAMPLE_KEY'
  ]);
  assert.notEqual(rejected.status,0);
  assert.match(rejected.stderr,/SCO already randomizes/u);
});
