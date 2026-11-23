'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const acorn=require('acorn');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {resolveLexicalReferences}=require('../workplace/agent1-lexical-reference-resolver');

/** @param {string} source */
function inspect(source){
  const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'});
  return resolveLexicalReferences(ast,'module');
}

test('export-star namespace Identifier is an externally published name, not a local read',()=>{
  for(const name of ['window','Storage','globalThis','localStorage','sessionStorage','self','customExport']){
    const code='export * as '+name+' from "./dep.mjs";';
    const labels=inspect(code);
    assert.deepEqual(labels.references.filter(ref=>ref.name===name),[],name);
    assert.deepEqual(labels.declarations.filter(decl=>decl.name===name),[],name);
  }
});

test('export-star alias does not shadow a distinct ambient root read',()=>{
  const source='export * as window from "./dep.mjs";export const observed=window;';
  const inspected=inspect(source);
  const mentions=inspected.references.filter(ref=>ref.name==='window');
  assert.equal(mentions.length,1);
  assert.equal(mentions[0].resolution.kind,'free-host-candidate');
  assert.equal(mentions[0].start,source.lastIndexOf('window'));
  assert.equal(inspected.declarations.filter(decl=>decl.name==='window').length,0);
});

test('export-star alias and same-spelled local lexical const remain distinct',()=>{
  const source='export * as window from "./dep.mjs";const window=13;export const local=window;';
  const inspected=inspect(source);
  const mentions=inspected.references.filter(ref=>ref.name==='window');
  assert.equal(mentions.length,1);
  assert.equal(mentions[0].resolution.kind,'local');
  assert.equal(inspected.declarations.filter(decl=>decl.name==='window').length,1);
});

test('module import/export attribute keys are labels, not lexical identifiers',()=>{
  for(const source of [
    'import data from "./payload.json" with {type:"json"};export default data;',
    'export {value} from "./payload.mjs" with {type:"json"};',
    'export * from "./payload.mjs" with {type:"json"};',
    'import data from "./payload.json" with {window:"json"};export default data;'
  ]){
    const inspected=inspect(source);
    const marker=source.includes('window:')?'window':'type';
    assert.deepEqual(inspected.references.filter(ref=>ref.name===marker),[],source);
    assert.deepEqual(inspected.declarations.filter(decl=>decl.name===marker),[],source);
  }
});

test('native Node ESM treats export-star namespace as a name, not a local variable',{
  timeout:30000
},async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-export-star-ref-'));
  const hadWindow=Object.hasOwn(globalThis,'window');
  const oldWindow=/** @type {any} */ (globalThis).window;
  try{
    await fs.writeFile(path.join(directory,'dep.mjs'),'export const number=42;\n');
    await fs.writeFile(path.join(directory,'entry.mjs'),
      'export * as window from "./dep.mjs";export const observation=window;\n');
    /** @type {any} */ (globalThis).window='ambient';
    const entry=await import(pathToFileURL(path.join(directory,'entry.mjs')).href);
    assert.equal(entry.observation,'ambient');
    assert.equal(entry.window.number,42);
  }finally{
    if(hadWindow)/** @type {any} */ (globalThis).window=oldWindow;
    else delete /** @type {any} */ (globalThis).window;
    await fs.rm(directory,{recursive:true,force:true});
  }
});
