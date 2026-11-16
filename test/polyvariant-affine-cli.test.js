'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');

const steps=[19,-7,41,-3,201,-55,13,-4,67,-10];

/** @returns {string} */
function expression() {
  let expr='(input|0)';
  for(const value of steps)expr='('+expr+(value<0?'-':'+')+Math.abs(value)+')';
  return '('+expr+'|0)';
}

/** @param {string} program @param {string[]} args @returns {string} */
function run(program,args) {
  const result=spawnSync(process.execPath,[program,...args],{
    encoding:'utf8',timeout:20000
  });
  assert.equal(result.status,0,String(result.stderr));
  return result.stdout.trim();
}

test('COO CLI preserves two-module ESM import and a public export',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-polyvariant-coo-'));
  try {
    const input=path.join(root,'input'),output=path.join(root,'output');
    await fs.mkdir(input);
    const original='export function guardedTotal(input){return '+expression()+';}';
    await atomicWrite(path.join(input,'math.mjs'),original);
    await atomicWrite(path.join(input,'entry.mjs'),
      'import {guardedTotal} from "./math.mjs";console.log(guardedTotal(-9));');
    run(path.join(__dirname,'../bin/coo.js'),[
      '--root',input,'--entry','entry.mjs','--out',output,
      '--seed','polyvariant-cli-ESM','--polyvariant-affine',
      'math.mjs:guardedTotal','--polyvariant-count','4'
    ]);
    const encoded=await fs.readFile(path.join(output,'math.mjs'),'utf8');
    assert.match(encoded,/switch\(/);
    assert.doesNotMatch(encoded,/\+19\)-7\)/);
    const observed=run(path.join(output,'entry.mjs'),[]);
    assert.equal(observed,String(steps.reduce((n,x)=>n+x,-9)|0));
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('SNO CLI emits a guarded launcher that executes the polyvariant CommonJS entry',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-polyvariant-sno-'));
  try {
    const input=path.join(root,'input'),output=path.join(root,'output');
    await fs.mkdir(input);
    const source='function guardedTotal(input){return '+expression()+
      ';}module.exports=guardedTotal;';
    await atomicWrite(path.join(input,'entry.cjs'),source);
    run(path.join(__dirname,'../bin/sno.js'),[
      '--root',input,'--entry','entry.cjs','--out',output,
      '--seed','polyvariant-cli-SNO','--polyvariant-affine',
      'entry.cjs:guardedTotal','--polyvariant-count','2'
    ]);
    const encoded=await fs.readFile(path.join(output,'entry.cjs'),'utf8');
    assert.match(encoded,/switch\(/);
    const launcher=path.join(output,'sno-entry.cjs');
    const observed=run('-e',[
      'const fn=require('+JSON.stringify(launcher)+');console.log(fn(-9));'
    ]);
    assert.equal(observed,String(steps.reduce((n,x)=>n+x,-9)|0));
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});
