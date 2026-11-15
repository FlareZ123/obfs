'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {parse}=require('../src/ast');
const {shardNativeBitvectorModule}=require('../workplace/coo-native-shards');

const before='export function scramble(x){return (((x^137)&(x>>>3))|(x<<7));}\n';

/**
 * @param {{path:string,code:string,sourceType?:'module'}[]} files
 * @returns {Promise<number[]>}
 */
async function load(files) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-native-shards-'));
  try {
    for(const file of files) {
      const full=path.join(root,file.path);
      fs.mkdirSync(path.dirname(full),{recursive:true});
      fs.writeFileSync(full,file.code,'utf8');
    }
    const imported=await import(pathToFileURL(path.join(root,files[0].path)).href);
    /** @type {(x:number)=>number} */
    const scramble=imported.scramble;
    const values=[-2147483648,-1,0,1,255,4096,2147483647];
    let state=0x1a32b97;
    for(let i=0;i<512;i++) {
      state^=state<<13;state^=state>>>17;state^=state<<5;
      values.push(state|0);
    }
    return values.map(scramble);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
}

/** @param {import('../src/ast').AstNode} node @returns {string} */
function canonical(node) {
  if(node.type==='Identifier')return node.name;
  if(node.type==='Literal')return String(node.value);
  if(node.type==='UnaryExpression')return '('+node.operator+canonical(node.argument)+')';
  if(node.type==='BinaryExpression')return '('+canonical(node.left)+node.operator+canonical(node.right)+')';
  throw new TypeError('Unsupported expression: '+node.type);
}

/**
 * Seedless source-only attacker. It uses parsed public modules and the ESM
 * import graph, with no access to original source or a compiler build seed.
 * @param {import('../workplace/coo-native-shards').ModuleFile[]} publicFiles
 * @returns {string}
 */
function recover(publicFiles) {
  const entry=parse(publicFiles[0].code,'module');
  /** @type {Map<string,string>} */
  const imported=new Map();
  for(const node of entry.body) {
    if(node.type==='ImportDeclaration') {
      const relative=node.source.value;
      const full=path.posix.normalize(path.posix.join(path.posix.dirname(publicFiles[0].path),relative));
      for(const specifier of node.specifiers)imported.set(specifier.local.name,full);
    }
  }
  const statement=entry.body.find((/** @type {import('../src/ast').AstNode} */ node)=>
    node.type==='ExportNamedDeclaration'&&node.declaration?.id?.name==='scramble');
  assert.ok(statement);
  const result=statement.declaration.body.body[0].argument;
  assert.equal(result.type,'BinaryExpression');
  /** @type {string[]} */
  const reconstructed=[];
  for(const side of [result.left,result.right]) {
    assert.equal(side.type,'CallExpression');
    const filename=imported.get(side.callee.name);
    assert.ok(filename);
    const shard=publicFiles.find(file=>file.path===filename);
    assert.ok(shard);
    const parsed=parse(shard.code,'module');
    const owner=parsed.body.find((/** @type {import('../src/ast').AstNode} */ node)=>
      node.declaration?.id?.name===side.callee.name);
    assert.ok(owner);
    reconstructed.push(canonical(owner.declaration.body.body[0].argument));
  }
  return '('+reconstructed[0]+result.operator+reconstructed[1]+')';
}

test('three-file bitvector kernel matches 12 seeds and 519 typed inputs',async()=>{
  const baseline=await load([{path:'lib/main.mjs',code:before,sourceType:'module'}]);
  const original=parse(before,'module').body[0].declaration.body.body[0].argument;
  for(let n=0;n<12;n++) {
    const generated=shardNativeBitvectorModule(
      {path:'lib/main.mjs',code:before,sourceType:'module'},
      {seed:'native-shards-'+n,names:['scramble']});
    assert.equal(generated.functions,1);
    assert.equal(generated.files.length,3);
    assert.deepEqual(await load(generated.files),baseline);
    assert.equal(recover(generated.files),canonical(original));
  }
});

test('paired topology matches source and is recovered seedlessly',async()=>{
  const baseline=await load([{path:'main.mjs',code:before,sourceType:'module'}]);
  const original=parse(before,'module').body[0].declaration.body.body[0].argument;
  for(let n=0;n<12;n++) {
    const output=shardNativeBitvectorModule(
      {path:'main.mjs',code:before,sourceType:'module'},
      {seed:'paired-native-'+n,names:['scramble'],topology:'paired'});
    assert.equal(output.functions,1);
    assert.equal(output.helperCalls,2);
    assert.equal(output.files.length,2);
    assert.deepEqual(await load(output.files),baseline);
    assert.equal(recover(output.files),canonical(original));
  }
});

test('50 generated operator graphs preserve signed-Int32 behavior and remain statically reversible',async()=>{
  const ops=['^','&','|','<<','>>','>>>'];
  const leaves=['x','1','7','31','255','-1','0','-2147483648','~x'];
  let state=0x3a4517ed;
  /** @returns {number} */
  function next() {
    state^=state<<13;state^=state>>>17;state^=state<<5;
    return state>>>0;
  }
  /** @param {number} depth @returns {string} */
  function tree(depth) {
    if(depth===0)return leaves[next()%leaves.length];
    return '('+tree(depth-1)+ops[next()%ops.length]+tree(depth-1)+')';
  }
  for(let graph=0;graph<50;graph++) {
    const expression='('+tree(2)+ops[next()%ops.length]+tree(2)+')';
    const source='export function scramble(x){return '+expression+';}\n';
    const input={path:'main.mjs',code:source,sourceType:/** @type {const} */('module')};
    const baseline=await load([input]);
    const topology=graph%2===0?'paired':'split';
    const transformed=shardNativeBitvectorModule(input,
      {seed:'native-grammar-'+graph,names:['scramble'],topology});
    assert.equal(transformed.functions,1,'refused graph '+graph+': '+expression);
    assert.deepEqual(await load(transformed.files),baseline,'graph '+graph+': '+expression);
    const original=parse(source,'module').body[0].declaration.body.body[0].argument;
    assert.equal(recover(transformed.files),canonical(original),'recovery '+graph);
  }
});

test('generated imports preserve ESM hashbang and directive prologue',async()=>{
  const source='#!/usr/bin/env node\n"use client";\n'+before;
  /** @type {import('../workplace/coo-native-shards').ModuleFile} */
  const original={path:'main.mjs',code:source,sourceType:'module'};
  const baseline=await load([original]);
  for(const topology of /** @type {const} */ (['split','paired'])) {
    const generated=shardNativeBitvectorModule(original,
      {seed:'directive',names:['scramble'],topology});
    assert.ok(generated.files[0].code.startsWith('#!/usr/bin/env node\n"use client";'));
    assert.deepEqual(await load(generated.files),baseline);
  }
});

test('hoisted exported kernel remains callable from an early cyclic importer',async()=>{
  /** @type {import('../workplace/coo-native-shards').ModuleFile} */
  const original={path:'main.mjs',sourceType:'module',
    code:'import "./peer.mjs";\n'+before};
  /** @type {import('../workplace/coo-native-shards').ModuleFile} */
  const peer={path:'peer.mjs',sourceType:'module',
    code:'import {scramble} from "./main.mjs";export const observed=scramble(41);'};
  const baseline=await load([original,peer]);
  for(const topology of /** @type {const} */ (['split','paired'])) {
    const transformed=shardNativeBitvectorModule(original,
      {seed:'cycle-native',names:['scramble'],reservedPaths:['peer.mjs'],topology});
    assert.ok(transformed.functions===1);
    assert.deepEqual(await load([transformed.files[0],peer,...transformed.files.slice(1)]),baseline);
  }
});

test('unsupported or potentially effectful expressions decline',()=>{
  for(const source of [
    'export function f(x){return x+1;}',
    'export function f(x){return x|1;}',
    'export function f(x){return (x^this.a)|(x<<2);}',
    'export function f(x){return (x^foo())|(x<<2);}',
    'export async function f(x){return (x^1)|(x<<2);}',
    'export function f(x=0){return (x^1)|(x<<2);}',
    'export function f(x){let y=x;return (x^1)|(y<<2);}',
    'export function f(x){return (x^1)|(() => x)();}',
    'export function f(x){return (x^1)|(x<<2);}const s=f.toString();',
    'export function f(x){return (x^1)|(x<<2);}eval("2+2");'
  ]) {
    /** @type {import('../workplace/coo-native-shards').ModuleFile} */
    const file={path:'source.mjs',sourceType:'module',code:source};
    const generated=shardNativeBitvectorModule(file,{seed:'decline',names:['f']});
    assert.deepEqual(generated.files,[file]);
    assert.equal(generated.declined,1);
  }
});

test('seeds diversify helpers deterministically and avoid reserved paths',()=>{
  /** @type {import('../workplace/coo-native-shards').ModuleFile} */
  const file={path:'source.mjs',sourceType:'module',code:before};
  const a=shardNativeBitvectorModule(file,{seed:'alpha',names:['scramble']});
  const b=shardNativeBitvectorModule(file,{seed:'beta',names:['scramble']});
  assert.notEqual(a.files[0].code,b.files[0].code);
  assert.ok(a.files[0].code.includes('export function scramble(x)'));
  assert.equal(a.files[0].code,shardNativeBitvectorModule(
    file,{seed:'alpha',names:['scramble']}).files[0].code);
  const collision=a.files[1].path;
  const c=shardNativeBitvectorModule(
    file,{seed:'alpha',names:['scramble'],reservedPaths:[collision]});
  assert.notEqual(a.files[1].path,c.files[1].path);
  assert.equal(a.files.length,c.files.length);
});
