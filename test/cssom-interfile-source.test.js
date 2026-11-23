'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} ESMFile */

/**
 * Use real native Node ESM module evaluation but model browser CSSOMString
 * conversion. Actual CSSOM runtime semantics are separately tested in
 * test/cssom-custom-property-source-browser.js.
 * @param {ESMFile[]} files
 * @returns {Promise<{text:string,value:number,independent:number}>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cssom-interfile-'));
  const map=new Map();
  Object.defineProperty(globalThis,'document',{
    configurable:true,value:{createElement(){
      return {style:{
        /** @param {unknown} key @param {unknown} value */
        setProperty(key,value){map.set(String(key),String(value));},
        /** @param {unknown} key */
        getPropertyValue(key){return map.get(String(key))??'';}
      }};
    }}
  });
  try {
    for(const file of files)
      await fs.writeFile(path.join(directory,file.path),file.code,'utf8');
    const imported=await import(pathToFileURL(path.join(directory,'observer.mjs')).href);
    return /** @type {{text:string,value:number,independent:number}} */(imported.observed);
  } finally {
    Reflect.deleteProperty(globalThis,'document');
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * @param {boolean} literal
 * @returns {ESMFile[]}
 */
function sources(literal) {
  const logic=literal?
    'const independent={otherSecret:73};'+
    'export const independentValue=independent.otherSecret;'+
    'export function inspect(){return 31;}' :
    'const externalOwner={observedSecret:31};'+
    'const independent={otherSecret:73};'+
    'export function inspect(){return externalOwner.observedSecret;}'+
    'export const independentValue=independent.otherSecret;';
  const observer='import {inspect,independentValue} from "./logic.mjs";'+
    'const style=document.createElement("div").style;'+
    'style.setProperty("--observed",'+(literal?'"literal"':'inspect')+');'+
    'export const observed={text:style.getPropertyValue("--observed"),'+
    'value:inspect(),independent:independentValue};';
  return [
    {path:'logic.mjs',sourceType:'module',code:logic},
    {path:'observer.mjs',sourceType:'module',code:observer}
  ];
}

/**
 * @param {ESMFile[]} files
 * @param {string} seed
 * @param {'coo'|'sco'|'sno'} mode
 * @returns {{files:ESMFile[],properties:number}}
 */
function generate(files,seed,mode) {
  const result=obfuscateFiles(files,{
    mode,closedWorld:true,seed,
    properties:true,identifiers:true,strings:false
  });
  return {
    files:result.files.map(file=>({
      path:file.path,sourceType:'module',code:/** @type {string} */(file.code)
    })),
    properties:result.files.reduce((count,file)=>count+file.metrics.properties,0)
  };
}

for(const mode of /** @type {const} */(['coo','sco','sno'])) {
  for(const literal of [false,true]) {
    test('cross-file CSSOM imported ESM '+mode+'/'+(literal?'literal positive':'negative'),async()=>{
      const original=sources(literal);
      const transformed=generate(original,'cssom-interfile/'+mode+'/'+String(literal),mode);
      const native=await execute(original);
      const actual=await execute(transformed.files);
      process.stdout.write('CSSOM_INTERFILE_SOURCE '+JSON.stringify({
        mode,literal,properties:transformed.properties,
        producerBytesChanged:transformed.files[0].code!==original[0].code,
        observerBytesChanged:transformed.files[1].code!==original[1].code,
        exactOutputParity:JSON.stringify(native)===JSON.stringify(actual),
        native,actual
      })+'\\n');
      assert.ok(literal||native.text.includes('observedSecret'));
      assert.equal(JSON.stringify(actual),JSON.stringify(native));
      if(literal)assert.ok(transformed.properties>0,
        'Literal CSSOM value leaves an independent private owner eligible');
    });
  }
}

module.exports={execute,sources,generate};
