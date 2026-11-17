'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,observesDistributedSource}=require('../src/ast');
const {obfuscateFiles,createScoHandler}=require('../src');

/**
 * Inline classic scripts can observe exact source bytes through the DOM.
 * Keep an unrelated private function-local binding to verify that the
 * source-observer veto has a meaningful positive transformation control.
 * @param {string} observation
 * @returns {string}
 */
function script(observation){
  return 'function calculate(input){const privateNumber=input+7;return privateNumber;}'+
    observation+';globalThis.output=calculate(2);';
}

/** @param {string} code @param {'coo'|'sco'|'sno'} mode */
function compile(code,mode){
  return obfuscateFiles([{path:'inline.js',sourceType:'script',code}],{
    mode,seed:'dom-inline-source-verifier',strings:true,identifiers:true
  }).files[0];
}

for(const [label,observation] of [
  ['direct currentScript','document.currentScript.text'],
  ['script collection','document.scripts[0].textContent'],
  ['global document property','globalThis.document.currentScript.text'],
  ['Window document alias','const doc=window.document;doc.scripts[0].text'],
  ['global object alias','const root=globalThis;const doc=root.document;doc.currentScript.text'],
  ['destructured global document','const {document:doc}=globalThis;doc.currentScript.text'],
  ['destructured current script','const {currentScript:element}=document;element.textContent'],
  ['destructured script collection','const {scripts:elements}=document;elements[0].text'],
  ['verified computed global document','const key="document";const doc=globalThis[key];doc.currentScript.text'],
  ['verified computed collection','const field="scripts";document[field][0].text'],
  ['unproved computed collection','let field="scripts";document[field][0].text'],
  ['unknown dynamic property','document[globalThis.chosenField]'],
  ['direct global computed document','globalThis["document"].scripts[0].text'],
  ['computed destructured source key','const {["currentScript"]:element}=document;element.text']
]) {
  test('inline browser source observation retains executable spelling: '+label,()=>{
    const code=script(observation);
    assert.equal(observesDistributedSource(parse(code,'script')),true,label);
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      const emitted=compile(code,mode);
      assert.equal(emitted.code,code,mode+'/'+label);
      assert.equal(emitted.metrics.bindings,0,mode+'/'+label);
      assert.equal(emitted.metrics.literals,0,mode+'/'+label);
    }
  });
}

test('unrelated browser document access retains normal identifier mangling',()=>{
  const code=script('const title=document.title;globalThis.propertyName=title');
  const ast=parse(code,'script');
  assert.equal(observesDistributedSource(ast),false);
  const result=compile(code,'coo');
  assert.ok(result.metrics.bindings>0,'Unrelated document.title must not disable local renaming');
  assert.ok(result.code!==code);
});

test('disclosing an inline source blocks host-lock source wrappers',()=>{
  const code=script('const scriptText=document.currentScript.text');
  assert.throws(()=>obfuscateFiles([
    {path:'inline.js',sourceType:'script',code}
  ],{mode:'coo',allowedHosts:['allowed.example'],strings:false,identifiers:true}),
  /Host locking cannot preserve observable source bytes/u);
  assert.throws(()=>createScoHandler([
    {path:'inline.js',sourceType:'script',code}
  ],{allowedHosts:['allowed.example']}),
  /Host locking cannot preserve observable source bytes/u);
});

test('a cross-file document script observer prevents unrelated private ESM key changes',()=>{
  const files=[
    {path:'state.mjs',sourceType:/** @type {const} */ ('module'),
      code:'export const state={secretField:23};'},
    {path:'entry.mjs',sourceType:/** @type {const} */ ('module'),
      code:'import {state} from "./state.mjs";'+
        'const scripts=document.scripts;console.log(state.secretField,scripts.length);'}
  ];
  const result=obfuscateFiles(files,{mode:'coo',seed:'browser-document-cross-file',
    closedWorld:true,strings:false,identifiers:true});
  assert.equal(result.crossFile.properties,0);
  assert.deepEqual(result.files.map(file=>file.code),files.map(file=>file.code));
});
