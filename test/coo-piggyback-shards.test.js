'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {piggybackShards}=require('../workplace/coo-piggyback-shards');
const {recoverString}=require('../sims/coo-piggyback-recover');
const {buildSample}=require('../examples/coo-piggyback/build.cjs');

/** @param {string} consumer @param {string} donor @param {string} [seed] */
function transform(consumer,donor,seed='test-seed-v1'){
  return piggybackShards({
    consumer:{path:'app.mjs',code:consumer,sourceType:'module'},
    donor:{path:'constants.mjs',code:donor,sourceType:'module'}
  },{seed,functionName:'message',closedWorld:true});
}

/** @param {string} root @param {string} name @param {string} source */
function write(root,name,source){
  const filename=path.join(root,name);
  fs.writeFileSync(filename,source,'utf8');
}

/** @param {string} root @returns {Promise<any>} */
function load(root){return import(pathToFileURL(path.join(root,'app.mjs')).href);}

test('reproducible before/after pair matches exact output and UTF-16 code units',async()=>{
  const generated=buildSample(true);
  assert.equal(generated.transformed,true);
  assert.equal(generated.files.length,2);
  const root=path.resolve(__dirname,'../examples/coo-piggyback');
  const original=await load(path.join(root,'before'));
  const changed=await load(path.join(root,'after'));
  for(const v of [0,-2,123,1000000]){
    assert.equal(changed.render(v),original.render(v));
    assert.equal(changed.message(),original.message());
  }
  assert.equal(changed.message().length,original.message().length);
  assert.equal(recoverString(generated.files[0].code,generated.files[1].code),original.message());
});

test('existing import graph is retained and a seedless source-only attacker recovers string',async()=>{
  const text='hi\u0000\ud800\udfff\u2603'.repeat(8);
  const app=`import {factor} from './constants.mjs';\nexport function message(){return ${JSON.stringify(text)};}\nexport function other(x){return factor+x;}\n`;
  const donor='export const factor=3;\n';
  const r=transform(app,donor);
  assert.equal(r.transformed,true);
  assert.equal(r.files.length,2);
  assert.equal(recoverString(r.files[0].code,r.files[1].code),text);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-shard-'));
  try{
    const original=path.join(dir,'original'),changed=path.join(dir,'changed');
    fs.mkdirSync(original);fs.mkdirSync(changed);
    write(original,'app.mjs',app);write(original,'constants.mjs',donor);
    for(const file of r.files)write(changed,file.path,file.code);
    const base=await load(original),obfs=await load(changed);
    assert.equal(obfs.message(),base.message());
    assert.equal(obfs.other(5),base.other(5));
    assert.equal(obfs.message(),base.message());
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('deterministic for the same seed and varied for distinct seeds',()=>{
  const app="import {factor} from './constants.mjs';\nexport function message(){return 'some relatively long string';}";
  const dep='export const factor=4;';
  const a=transform(app,dep,'a'),b=transform(app,dep,'a'),c=transform(app,dep,'b');
  assert.deepEqual(a,b);
  assert.notEqual(a.files[0].code,c.files[0].code);
  assert.equal(recoverString(a.files[0].code,a.files[1].code),'some relatively long string');
  assert.equal(recoverString(c.files[0].code,c.files[1].code),'some relatively long string');
});

test('declines unsupported shape, known source observer, and non-leaf donor',()=>{
  const good="import {x} from './constants.mjs';\nexport function message(){return 'hello';}";
  const dep='export const x=1;';
  assert.equal(transform('export function message(){return "hello"}',dep).transformed,false);
  assert.equal(transform(good,'import "./third.mjs";\n'+dep).transformed,false);
  assert.equal(transform(good+'\nmessage.toString();',dep).transformed,false);
  assert.equal(transform(good.replace("return 'hello'","return x+'hello'"),dep).transformed,false);
  assert.throws(()=>piggybackShards({consumer:{path:'app.mjs',code:good,sourceType:'module'},donor:{path:'constants.mjs',code:dep,sourceType:'module'}},{seed:'a',functionName:'message',closedWorld:/** @type {any} */ (false)}),TypeError);
});

test('preserves native import evaluation order when donor is second dependency',async()=>{
  const app="import './first.mjs';\nimport {x} from './constants.mjs';\nexport function message(){return 'kept order';}\nexport function state(){return globalThis.__pb_order.join(',');}";
  const dep="globalThis.__pb_order.push('donor');\nexport const x=2;";
  const first="globalThis.__pb_order.push('first');\n";
  const transformed=transform(app,dep);
  assert.equal(transformed.transformed,true);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-order-'));
  try{
    for(const version of ['original','changed']){
      fs.mkdirSync(path.join(dir,version));
      write(path.join(dir,version),'first.mjs',first);
      write(path.join(dir,version),'app.mjs',version==='original'?app:transformed.files[0].code);
      write(path.join(dir,version),'constants.mjs',version==='original'?dep:transformed.files[1].code);
    }
    Reflect.set(globalThis,'__pb_order',[]);
    const base=await load(path.join(dir,'original'));
    assert.equal(base.state(),'first,donor');
    Reflect.set(globalThis,'__pb_order',[]);
    const obfs=await load(path.join(dir,'changed'));
    assert.equal(obfs.state(),'first,donor');
    assert.equal(obfs.message(),base.message());
  }finally{Reflect.deleteProperty(globalThis,'__pb_order');fs.rmSync(dir,{recursive:true,force:true});}
});


test('hoisted function called before its declaration and directive prologue remain valid',async()=>{
  const app='"use client";\nimport {factor} from "./constants.mjs";\n'+
    'export const initialized=message();\n'+
    'export function message(){return "early hoisted return";}\n'+
    'export const score=factor+5;\n';
  const dep='export const factor=37;\n';
  const changed=transform(app,dep);
  assert.equal(changed.transformed,true);
  assert.ok(changed.files[0].code.startsWith('"use client";'),
    'Directive prologue must remain in its original position');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-early-'));
  try{
    for(const kind of ['original','changed']){
      const folder=path.join(dir,kind);
      fs.mkdirSync(folder);
      write(folder,'app.mjs',kind==='original'?app:changed.files[0].code);
      write(folder,'constants.mjs',kind==='original'?dep:changed.files[1].code);
    }
    const base=await load(path.join(dir,'original'));
    const obfs=await load(path.join(dir,'changed'));
    assert.equal(obfs.initialized,base.initialized);
    assert.equal(obfs.message(),base.message());
    assert.equal(obfs.score,base.score);
    assert.equal(obfs.initialized,'early hoisted return');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
