'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * This comparative proof assumes a pristine native globalThis.Math reference.
 * It deliberately tests the positive-yield cost of an unconditional guard for
 * unknown host access. A malicious host could replace Math with an accessor;
 * that stronger threat model is excluded from this positive fixture.
 */
test('known native Math lookup retains independent private-owner rewrite yield',()=>{
  const source='const owner={longPrivateFieldForHost:47};'+
    'const value=owner.longPrivateFieldForHost;'+
    'export const observed=value+globalThis.Math.PI;';
  const result=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'agent39-native-math-positive',
    properties:true,identifiers:false,strings:false
  });
  const observer=observesFunctionSource(parse(source,'module'));
  console.log(JSON.stringify({fixture:'native-Math-owner',
    sourceObserver:observer,properties:result.files[0].metrics.properties}));
  assert.equal(result.files[0].metrics.properties,1,
    'Safe private-owner rewrite must survive a trusted native Math read');
  assert.equal(observer,false,
    'The pristine native Math data property is an explicit positive-host premise');
});
