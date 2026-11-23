'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * A dynamically assembled Error property name can select the source-bearing
 * `stack` field without ever spelling it as an AST member key.
 * The private owner is evaluated before the Error capture on the same line:
 * a length-changing rename moves the Error's observable column.
 * @param {string} selector
 * @returns {string}
 */
function source(selector){
  return "const owner={longPrivateField:47};const value=owner.longPrivateField;"+
    "const error=new Error('source-location');const key="+selector+";"+
    "export const observed={value,frame:error[key].split('\\n')[1]};";
}

/**
 * @param {string} code
 * @param {string} seed
 */
function compile(code,seed){
  return obfuscateFiles([{path:'source.mjs',sourceType:'module',code}],{
    mode:'coo',closedWorld:true,seed,properties:true,identifiers:false,strings:false
  });
}

test('dynamic Error stack read refuses source-column-changing private key rewrite',()=>{
  const native=source("['st','ack'].join('')");
  assert.equal(observesFunctionSource(parse(native,'module')),true,
    'An aliased Error with unknown computed property can expose stack coordinates');
  const result=compile(native,'dynamic-error-stack-source-negative');
  assert.equal(result.files[0].code,native);
  assert.equal(result.files[0].metrics.properties,0);
});

test('known Error message read retains unrelated private-key transform yield',()=>{
  const native=source("'message'").replace("error[key].split('\\n')[1]","error[key]");
  assert.equal(observesFunctionSource(parse(native,'module')),false);
  const result=compile(native,'known-error-message-positive');
  assert.equal(result.files[0].metrics.properties,1);
  assert.doesNotMatch(/** @type {string} */(result.files[0].code),/longPrivateField/u);
});

test('unknown computed key on a plain inert record does not veto unrelated owner',()=>{
  const native="const owner={longPrivateField:47};const value=owner.longPrivateField;"+
    "const record={safeValue:'ok'};const key=['safe','Value'].join('');"+
    "export const observed=[value,record[key]];";
  assert.equal(observesFunctionSource(parse(native,'module')),false);
  const result=compile(native,'unknown-inert-record-positive');
  assert.equal(result.files[0].metrics.properties,1);
});
