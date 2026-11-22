'use strict';

const {test}=require('node:test');
const {parse,observesFunctionSource}=require('../src/ast');
const {collectBindings,proveLocalObject,renameLocalProperties,collectSourceExposedBodies}=require('../src/properties');
const {obfuscateFiles}=require('../src');

test('agent3 source proof trace: private scalar amid public callable',()=>{
  const text='const publicOwner={secretField:3};const privateOwner={privateField:4};'+
    'const standalone={standaloneKey:11};const standaloneResult=standalone.standaloneKey;'+
    'function privateHelper(privateParam){return privateParam+privateOwner.privateField+"private-combined-string-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ";}'+
    'export function publicRead(publicParam){return publicOwner.secretField+publicParam+"public-combined-string-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ";}'+
    'export const privateResult=privateHelper(5)+standaloneResult;';
  const ast=parse(text,'module');
  const bindings=collectBindings(ast);
  const proof=proveLocalObject(ast,'standalone',bindings);
  const edited=renameLocalProperties(text,ast,{seed:'sft-local'});
  const out=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:text}],{
    mode:'coo',closedWorld:true,seed:'esm-public-source-combined',
    strings:true,identifiers:true,properties:true,controlFlow:false
  });
  process.stdout.write('SOURCE_PROOF_TRACE '+JSON.stringify({
    observer:observesFunctionSource(ast),
    sourceExposedBodies:collectSourceExposedBodies(ast,bindings).size,
    standaloneProof:proof?{
      members:proof.members.length,patterns:proof.patterns.length,
      inChecks:proof.inChecks.length,reflections:proof.reflections.length
    }:null,
    localMetrics:{objects:edited.objects,properties:edited.properties},
    coreMetrics:out.files[0].metrics,
    crossFile:out.crossFile,
    edited:out.files[0].code
  })+'\n');
});
