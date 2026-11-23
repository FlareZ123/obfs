'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');

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
  const result=compile(native,'dynamic-error-stack-source-negative');
  assert.equal(result.files[0].metrics.properties,0,
    'A source-location read must not expose an edited column: '+result.files[0].code);
  assert.equal(observesFunctionSource(parse(native,'module')),true,
    'An aliased Error with unknown computed property can expose stack coordinates');
  assert.equal(result.files[0].code,native);
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

test('transitive Error alias with computed stack name retains original source',()=>{
  const native=source("['st','ack'].join('')")
    .replace('export const observed=', 'const alias=error;export const observed=')
    .replace('frame:error[key]', 'frame:alias[key]');
  const result=compile(native,'dynamic-error-stack-transitive-alias');
  assert.equal(observesFunctionSource(parse(native,'module')),true);
  assert.equal(result.files[0].metrics.properties,0);
  assert.equal(result.files[0].code,native);
});

test('sequence receiver still resolves to a known Error stack carrier',()=>{
  const native=source("['st','ack'].join('')")
    .replace('frame:error[key]', 'frame:(0,error)[key]');
  const result=compile(native,'dynamic-error-stack-sequence');
  assert.equal(observesFunctionSource(parse(native,'module')),true);
  assert.equal(result.files[0].metrics.properties,0);
});

test('unknown computed destructuring key can extract Error.stack',()=>{
  const native="const owner={longPrivateField:47};const value=owner.longPrivateField;"+
    "const error=new Error('source-location');const key=['st','ack'].join('');"+
    "const {[key]:frame}=error;export const observed={value,frame:frame.split('\\n')[1]};";
  const result=compile(native,'dynamic-error-stack-destructuring');
  assert.equal(observesFunctionSource(parse(native,'module')),true);
  assert.equal(result.files[0].metrics.properties,0);
});

test('computed destructuring from inert non-Error record still preserves yield',()=>{
  const native="const owner={longPrivateField:47};const value=owner.longPrivateField;"+
    "const record={safeValue:'ok'};const key=['safe','Value'].join('');"+
    "const {[key]:frame}=record;export const observed={value,frame};";
  const result=compile(native,'inert-record-dynamic-destructuring');
  assert.equal(observesFunctionSource(parse(native,'module')),false);
  assert.equal(result.files[0].metrics.properties,1);
});

test('real ESM stack column changes under unsafe rename, not under guarded build',async()=>{
  const native=source("['st','ack'].join('')");
  const compiled=compile(native,'real-esm-stack-parity').files[0].code;
  const unsafe=native.replaceAll('longPrivateField','a');
  const dir=await mkdtemp(path.join(tmpdir(),'obfs-dynamic-error-stack-'));
  /**
   * @param {string} file
   * @param {string} code
   */
  async function measure(file,code){
    await atomicWrite(file,code);
    const module=await /** @type {Promise<{observed:{value:number,frame:string}}>} */(
      import(pathToFileURL(file).href)
    );
    const match=/:(\d+):(\d+)\)?$/u.exec(module.observed.frame);
    assert.ok(match,'Missing expected Node stack frame: '+module.observed.frame);
    return {value:module.observed.value,line:Number(match[1]),column:Number(match[2])};
  }
  try{
    const original=await measure(path.join(dir,'original.mjs'),native);
    const protectedResult=await measure(path.join(dir,'protected.mjs'),
      /** @type {string} */(compiled));
    const unsafeResult=await measure(path.join(dir,'unsafe.mjs'),unsafe);
    assert.deepEqual(protectedResult,original);
    assert.equal(unsafeResult.value,original.value);
    assert.notDeepEqual(unsafeResult,original,
      'An otherwise output-equivalent owner rename changes Error.stack coordinates');
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});
