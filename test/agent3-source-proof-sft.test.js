'use strict';

const {test}=require('node:test');
const {parse,observesFunctionSource}=require('../src/ast');
const {collectBindings,proveLocalObject,renameLocalProperties,collectSourceExposedBodies}=require('../src/properties');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} label
 * @param {string} text
 */
function trace(label,text) {
  const ast=parse(text,'module');
  const bindings=collectBindings(ast);
  const proof=proveLocalObject(ast,'standalone',bindings);
  const edited=renameLocalProperties(text,ast,{seed:'sft-local'});
  const out=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:text}],{
    mode:'coo',closedWorld:true,seed:'sft-'+label,
    strings:true,identifiers:true,properties:true,controlFlow:false
  });
  process.stdout.write('SOURCE_PROOF_TRACE '+JSON.stringify({
    label,
    observer:observesFunctionSource(ast),
    sourceExposedBodies:collectSourceExposedBodies(ast,bindings).size,
    standaloneProof:proof?{members:proof.members.length,patterns:proof.patterns.length}:null,
    localMetrics:{objects:edited.objects,properties:edited.properties},
    coreMetrics:out.files[0].metrics,
    crossFile:out.crossFile,
    unchanged:out.files[0].code===text
  })+'\n');
}

test('agent3 private owner proof control with callable source observers',()=>{
  const object='const standalone={standaloneKey:11};const standaloneResult=standalone.standaloneKey;';
  trace('unobserved',object+'export const privateResult=standaloneResult;');
  trace('pure-public-callable',object+'export function publicRead(publicParam){return 3;}export const privateResult=standaloneResult;');
  trace('public-param-coercer',object+'export function publicRead(publicParam){return 3+publicParam;}export const privateResult=standaloneResult;');
  trace('private-direct-call',object+'function privateHelper(privateParam){return privateParam?4:5;}export const privateResult=privateHelper(true)+standaloneResult;');
});
