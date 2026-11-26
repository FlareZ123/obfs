'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

const options={
  mode:'coo',
  closedWorld:true,
  seed:'agent10-bound-proof-custom-bind-review',
  properties:true,
  identifiers:false,
  strings:false
};

/**
 * Compile a single closed-world ESM module.
 * @param {string} source
 * @returns {{code:string,properties:number}}
 */
function compile(source) {
  const output=obfuscateFiles([{
    path:'entry.mjs',
    sourceType:'module',
    code:source
  }],options);
  return {
    code:/** @type {string} */(output.files[0].code),
    properties:output.files[0].metrics.properties
  };
}

/**
 * Execute an ESM module in a fresh Node process.
 * @param {string} source
 * @returns {{status:number|null,stdout:string,stderr:string}}
 */
function runEsm(source) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-bound-custom-bind-'));
  try {
    const file=path.join(root,'entry.mjs');
    fs.writeFileSync(file,source);
    const child=spawnSync(process.execPath,[file],{
      encoding:'utf8',
      timeout:8000
    });
    return {
      status:child.status,
      stdout:child.stdout,
      stderr:child.stderr
    };
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
}

/**
 * A source-observing bound export must not permit the target body to change.
 * @param {string} source
 * @param {string} label
 */
function assertSourceParity(source,label) {
  const emitted=compile(source);
  assert.equal(emitted.properties,0, label+' must refuse private-key rewriting');
  assert.deepEqual(runEsm(emitted.code),runEsm(source),label+' must preserve runtime output');
}

test('custom bind returning this keeps the original target source spelling',()=>{
  const source='const owner={secretField:7};'+
    'const internal=()=>owner.secretField;'+
    'Function.prototype.bind=function(){return this;};'+
    'const hot=internal.bind(null);'+
    'export const source=()=>hot.toString();'+
    'process.stdout.write(source());';
  assertSourceParity(source,'direct Function.prototype.bind replacement');
});

test('aliased Function.prototype mutation returning this keeps target source spelling',()=>{
  const source='const owner={secretField:7};'+
    'const internal=()=>owner.secretField;'+
    'const fp=Function.prototype;'+
    'fp.bind=function(){return this;};'+
    'const hot=internal.bind(null);'+
    'export const source=()=>hot.toString();'+
    'process.stdout.write(source());';
  assertSourceParity(source,'aliased Function.prototype.bind replacement');
});

test('custom bind wrapper cannot consume an owner returned by its target',()=>{
  const source='const owner={secretField:7,otherField:11};'+
    'Function.prototype.bind=function(){'+
    'const target=this;return function(){return target().secretField;};};'+
    'const internal=()=>owner;'+
    'const hot=internal.bind(null);'+
    'export const read=()=>hot();'+
    'process.stdout.write(String(read()));';
  assertSourceParity(source,'custom bind wrapper around an owner-returning target');
});

test('Object.defineProperty replacement of bind keeps target source spelling',()=>{
  const source='const owner={secretField:7};'+
    'const internal=()=>owner.secretField;'+
    'const fp=Function.prototype;'+
    'Object.defineProperty(fp,"bind",{configurable:true,writable:true,'+
    'value:function(){return this;}});'+
    'const hot=internal.bind(null);'+
    'export const source=()=>hot.toString();'+
    'process.stdout.write(source());';
  assertSourceParity(source,'descriptor-based Function.prototype.bind replacement');
});
