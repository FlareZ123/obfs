'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');
const {readArgs}=require('../src/cli');

/**
 * Execute a real command-line entry or generated Node program in a child
 * process. Preserve stdout, stderr and exit status, not just a return value.
 * @param {string} executable
 * @param {string[]} args
 * @returns {{status:number|null,stdout:string,stderr:string}}
 */
function run(executable,args){
  const result=spawnSync(process.execPath,[executable,...args],{
    encoding:'utf8',timeout:15000
  });
  assert.equal(result.error,undefined,result.error?.message);
  return {status:result.status,stdout:result.stdout,stderr:result.stderr};
}

/** @param {string} code @returns {string[]} */
function tokens(code){
  return [...new Set(code.match(/_p[a-f0-9]{10,12}/gu)??[])].sort();
}

test('COO CLI private field names vary without changing native ESM behavior or build seed',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-entropy-cli-coo-'));
  try{
    const input=path.join(folder,'input');
    const out1=path.join(folder,'a'),out2=path.join(folder,'b');
    await fs.mkdir(input);
    await atomicWrite(path.join(input,'state.mjs'),
      'export const state={secretField:41,otherField:13,sessionMark:7};');
    await atomicWrite(path.join(input,'entry.mjs'),
      'import {state} from "./state.mjs";'+
      'console.log(JSON.stringify([state.secretField,state.otherField,state.sessionMark]));');
    const native=run(path.join(input,'entry.mjs'),[]);
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'[41,13,7]\n');
    const opts=['--root',input,'--entry','entry.mjs','--closed-world',
      '--seed','public-fixture-deterministic-seed','--random-property-names'];
    for(const output of [out1,out2]){
      const build=run(path.join(__dirname,'../bin/coo.js'),[
        ...opts,'--out',output
      ]);
      assert.equal(build.status,0,build.stderr);
      assert.deepEqual(run(path.join(output,'entry.mjs'),[]),native);
    }
    const a=await fs.readFile(path.join(out1,'state.mjs'),'utf8');
    const b=await fs.readFile(path.join(out2,'state.mjs'),'utf8');
    assert.equal(tokens(a).length,3,'COO must really rename all three owned fields');
    assert.equal(tokens(b).length,3);
    assert.notDeepEqual(tokens(a),tokens(b),
      'Same build seed must not imply the same emitted property spellings');
    assert.equal(Buffer.byteLength(a),Buffer.byteLength(b),
      'Secret entropy must not introduce runtime or file-size overhead');
  }finally {await fs.rm(folder,{recursive:true,force:true});}
});

test('SNO CLI private field names vary while single-entry launcher verifies both builds',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-entropy-cli-sno-'));
  try{
    const input=path.join(folder,'input');
    const out1=path.join(folder,'a'),out2=path.join(folder,'b');
    await fs.mkdir(input);
    await atomicWrite(path.join(input,'entry.cjs'),
      "'use strict';"+
      'const record={secretField:41,otherField:13,sessionMark:7};'+
      'console.log(JSON.stringify([record.secretField,record.otherField,record.sessionMark]));');
    const native=run(path.join(input,'entry.cjs'),[]);
    assert.equal(native.status,0,native.stderr);
    for(const output of [out1,out2]){
      const build=run(path.join(__dirname,'../bin/sno.js'),[
        '--root',input,'--entry','entry.cjs','--out',output,
        '--seed','public-fixture-deterministic-seed','--random-property-names'
      ]);
      assert.equal(build.status,0,build.stderr);
      assert.deepEqual(run(path.join(output,'sno-entry.cjs'),[]),native,
        'Integrity-checking launcher must accept its private-entropy build');
    }
    const a=await fs.readFile(path.join(out1,'entry.cjs'),'utf8');
    const b=await fs.readFile(path.join(out2,'entry.cjs'),'utf8');
    assert.equal(tokens(a).length,3);
    assert.equal(tokens(b).length,3);
    assert.notDeepEqual(tokens(a),tokens(b));
    assert.equal(Buffer.byteLength(a),Buffer.byteLength(b));
  }finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('SCO CLI must refuse a silent no-op private entropy flag',()=>{
  const parsed=readArgs(['--random-property-names']);
  assert.equal(parsed.experimentalEntropyPropertyNames,true);
  assert.equal(readArgs([]).experimentalEntropyPropertyNames,false,
    'Existing default build behavior is unchanged');
  const result=run(path.join(__dirname,'../bin/sco.js'),[
    '--random-property-names'
  ]);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/SCO already randomizes each HTTP response/u);
});
