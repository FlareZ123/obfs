'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {{name:string,files:SourceFile[],observer:string,kind:'properties'|'bindings'}} Fixture */

/** @type {Fixture[]} */
const fixtures=[
  {
    name:'renamed named export exposes captured member',
    files:[{path:'private.mjs',sourceType:'module',code:
      'const owner={secretField:11};function read(){return owner.secretField;}export {read as publicRead};'}],
    observer:'import {publicRead} from "./private.mjs";console.log(JSON.stringify([publicRead.toString(),publicRead()]));',
    kind:'properties'
  },
  {
    name:'default-exported immutable arrow alias exposes captured member',
    files:[{path:'private.mjs',sourceType:'module',code:
      'const owner={secretField:17};const read=()=>owner.secretField;export default read;'}],
    observer:'import read from "./private.mjs";console.log(JSON.stringify([read.toString(),read()]));',
    kind:'properties'
  },
  {
    name:'exported class method exposes captured member',
    files:[{path:'private.mjs',sourceType:'module',code:
      'const owner={secretField:23};export class Api{read(){return owner.secretField;}}'}],
    observer:'import {Api} from "./private.mjs";const api=new Api();console.log(JSON.stringify([api.read.toString(),api.read()]));',
    kind:'properties'
  },
  {
    name:'reexport exposes source from supplier module',
    files:[
      {path:'private.mjs',sourceType:'module',code:
        'const owner={secretField:31};function read(){return owner.secretField;}export {read};'},
      {path:'bridge.mjs',sourceType:'module',code:
        'export {read as publicRead} from "./private.mjs";'}
    ],
    observer:'import {publicRead} from "./bridge.mjs";console.log(JSON.stringify([publicRead.toString(),publicRead()]));',
    kind:'properties'
  },
  {
    name:'exported array exposes contained function',
    files:[{path:'private.mjs',sourceType:'module',code:
      'const owner={secretField:37};export const api=[function read(){return owner.secretField;}];'}],
    observer:'import {api} from "./private.mjs";console.log(JSON.stringify([api[0].toString(),api[0]() ]));',
    kind:'properties'
  },
  {
    name:'renamed named export exposes parameter spelling',
    files:[{path:'private.mjs',sourceType:'module',code:
      'function read(secretParam){return secretParam+1;}export {read as publicRead};'}],
    observer:'import {publicRead} from "./private.mjs";console.log(JSON.stringify([publicRead.toString(),publicRead(9)]));',
    kind:'bindings'
  }
];

/**
 * Run a closed source group with an independent ESM observer which is not
 * supplied to the compiler. The external observer is the tested threat
 * surface, so including it in the compile-time group would invalidate it.
 * @param {SourceFile[]} files
 * @param {string} observer
 * @returns {Promise<string>}
 */
async function observe(files,observer) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-export-reach-'));
  try {
    for(const file of files) {
      assert.equal(typeof file.code,'string');
      await atomicWrite(path.join(root,file.path),file.code);
    }
    await atomicWrite(path.join(root,'observe.mjs'),observer);
    const child=spawnSync(process.execPath,[path.join(root,'observe.mjs')],{
      cwd:root,encoding:'utf8',timeout:10000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  for(const fixture of fixtures) {
    test('independent ESM source observer parity: '+mode+' / '+fixture.name,async()=>{
      const source=fixture.files;
      const native=await observe(source,fixture.observer);
      const transformed=obfuscateFiles(source,{
        mode,closedWorld:true,seed:'esm-export-reach-'+mode+'-'+fixture.name,
        strings:false,properties:fixture.kind==='properties',
        identifiers:fixture.kind==='bindings'
      });
      const rewriteCount=transformed.files.reduce((count,file)=>count+
        (fixture.kind==='properties'?file.metrics.properties:file.metrics.bindings),0);
      const emitted=await observe(transformed.files,fixture.observer);
      console.log('ESM_EXPORT_REACH '+JSON.stringify({
        mode,case:fixture.name,rewriteKind:fixture.kind,rewriteCount,
        sourceEqual:emitted===native,valueEqual:JSON.parse(emitted)[1]===JSON.parse(native)[1]
      }));
      // A conservative refusal is a sound outcome for source-exposed callables.
      // The private-function control below requires positive transformation yield.
      assert.equal(emitted,native,'External ESM consumer sees changed function source');
    });
  }
}

for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  test('private nonescaping function retains property rewrite yield: '+mode,async()=>{
    const original=[{path:'private.mjs',sourceType:'module',
      code:'const owner={secretField:43};function read(){return owner.secretField;}export const value=read();'}];
    const observer='import {value} from "./private.mjs";console.log(JSON.stringify([value,value]));';
    const baseline=await observe(original,observer);
    const transformed=obfuscateFiles(original,{
      mode,closedWorld:true,seed:'esm-export-reach-private-'+mode,
      strings:false,identifiers:false
    });
    assert.ok(transformed.files[0].metrics.properties>0,
      'Non-escaping local owner should remain eligible');
    assert.equal(await observe(transformed.files,observer),baseline);
  });
}

for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  test('declared source observer closes the ESM graph and forces conservative refusal: '+mode,async()=>{
    const privateFile={path:'private.mjs',sourceType:/** @type {const} */('module'),
      code:'const owner={secretField:59};export function read(){return owner.secretField;}'};
    const observer='import {read} from "./private.mjs";console.log(JSON.stringify([read.toString(),read()]));';
    const supplied=[privateFile,{path:'observe.mjs',sourceType:/** @type {const} */('module'),code:observer}];
    const baseline=await observe(supplied,observer);
    const compiled=obfuscateFiles(supplied,{
      mode,closedWorld:true,seed:'esm-declared-observer-'+mode,
      strings:false,properties:true,identifiers:true
    });
    const protectedModule=compiled.files.find(file=>file.path==='private.mjs');
    assert.ok(protectedModule);
    assert.equal(protectedModule.metrics.properties,0,
      'The compiler should decline owner-key edits with a declared source observer');
    assert.equal(protectedModule.metrics.bindings,0,
      'The compiler should decline identifier edits with a declared source observer');
    assert.equal(await observe(compiled.files,observer),baseline);
  });
}

for(const fixture of fixtures) {
  test('ordinary esbuild minification baseline preserves value: '+fixture.name,async()=>{
    const {transformSync}=require('esbuild');
    const baseline=await observe(fixture.files,fixture.observer);
    const minified=fixture.files.map(file=>({...file,code:transformSync(String(file.code),{
      loader:'js',format:'esm',target:'es2022',minify:true
    }).code}));
    const result=await observe(minified,fixture.observer);
    const [nativeSource,nativeValue]=JSON.parse(baseline);
    const [minifiedSource,minifiedValue]=JSON.parse(result);
    assert.equal(minifiedValue,nativeValue,
      'The ordinary minifier should preserve the tested numerical result');
    console.log('ESM_MINIFIER_BASELINE '+JSON.stringify({
      case:fixture.name,sourceEqual:minifiedSource===nativeSource,valueEqual:true,
      originalBytes:fixture.files.reduce((n,file)=>n+String(file.code).length,0),
      minifiedBytes:minified.reduce((n,file)=>n+String(file.code).length,0)
    }));
  });
}

for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  test('nested literal source visible through separately exported containing callable: '+mode,async()=>{
    const sources=[{path:'private.mjs',sourceType:/** @type {const} */('module'),
      code:'function helper(record){return record.secretField;}'+
        'function publicRead(){const owner={secretField:41};return helper(owner);}'+
        'export {publicRead};'}];
    const observer='import {publicRead} from "./private.mjs";'+
      'console.log(JSON.stringify([publicRead.toString(),publicRead()]));';
    const native=await observe(sources,observer);
    const transformed=obfuscateFiles(sources,{
      mode,closedWorld:true,seed:'esm-literal-inside-export-'+mode,
      strings:false,properties:true,identifiers:false
    });
    const result=await observe(transformed.files,observer);
    console.log('ESM_NESTED_PUBLIC_LITERAL '+JSON.stringify({
      mode,sourceEqual:result===native,
      propertyRewrites:transformed.files[0].metrics.properties,
      valueEqual:JSON.parse(native)[1]===JSON.parse(result)[1]
    }));
    assert.equal(result,native,'Externally visible parent callable source must remain identical');
  });
}

for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  test('exported class static field initializer is observable through class source: '+mode,async()=>{
    const sources=[{path:'private.mjs',sourceType:/** @type {const} */('module'),
      code:'const owner={secretField:53};'+
        'class PublicClass{static value=owner.secretField;}export {PublicClass};'}];
    const observer='import {PublicClass} from "./private.mjs";'+
      'console.log(JSON.stringify([PublicClass.toString(),PublicClass.value]));';
    const native=await observe(sources,observer);
    const transformed=obfuscateFiles(sources,{
      mode,closedWorld:true,seed:'esm-class-static-source-'+mode,
      strings:false,properties:true,identifiers:false
    });
    const result=await observe(transformed.files,observer);
    console.log('ESM_CLASS_STATIC_SOURCE '+JSON.stringify({
      mode,sourceEqual:result===native,
      propertyRewrites:transformed.files[0].metrics.properties,
      valueEqual:JSON.parse(native)[1]===JSON.parse(result)[1]
    }));
    assert.equal(result,native,'Externally visible class initializer source must remain identical');
  });
}

for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  test('exported class initializer preserves captured private identifier spelling: '+mode,async()=>{
    const sources=[{path:'private.mjs',sourceType:/** @type {const} */('module'),
      code:'const secretValue=71;class PublicClass{static value=secretValue;}export {PublicClass};'}];
    const observer='import {PublicClass} from "./private.mjs";'+
      'console.log(JSON.stringify([PublicClass.toString(),PublicClass.value]));';
    const native=await observe(sources,observer);
    const transformed=obfuscateFiles(sources,{
      mode,closedWorld:true,seed:'esm-class-static-identifier-'+mode,
      strings:false,properties:false,identifiers:true
    });
    const result=await observe(transformed.files,observer);
    console.log('ESM_CLASS_IDENTIFIER_SOURCE '+JSON.stringify({
      mode,sourceEqual:result===native,
      identifierRewrites:transformed.files[0].metrics.bindings,
      valueEqual:JSON.parse(native)[1]===JSON.parse(result)[1]
    }));
    assert.equal(result,native,'Externally visible class initializer identifier source must remain identical');
  });
  test('exported class static block preserves locally declared identifier spelling: '+mode,async()=>{
    const sources=[{path:'private.mjs',sourceType:/** @type {const} */('module'),
      code:'class PublicClass{static{const secretInside=79;this.value=secretInside;}}export {PublicClass};'}];
    const observer='import {PublicClass} from "./private.mjs";'+
      'console.log(JSON.stringify([PublicClass.toString(),PublicClass.value]));';
    const native=await observe(sources,observer);
    const transformed=obfuscateFiles(sources,{
      mode,closedWorld:true,seed:'esm-class-static-block-identifier-'+mode,
      strings:false,properties:false,identifiers:true
    });
    const result=await observe(transformed.files,observer);
    console.log('ESM_CLASS_STATIC_BLOCK '+JSON.stringify({
      mode,sourceEqual:result===native,
      identifierRewrites:transformed.files[0].metrics.bindings,
      valueEqual:JSON.parse(native)[1]===JSON.parse(result)[1]
    }));
    assert.equal(result,native,'Externally visible class static block source must remain identical');
  });
}

for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  for(const scenario of [
    {kind:'properties',code:'const owner={secretField:83};'+
      'class InternalClass{static value=owner.secretField;}export const instance=new InternalClass();'},
    {kind:'bindings',code:'const privateValue=89;'+
      'class InternalClass{static value=privateValue;}export const instance=new InternalClass();'}
  ]) {
    test('class source reachable through exported instance constructor: '+mode+' / '+scenario.kind,async()=>{
      const sources=[{path:'private.mjs',sourceType:/** @type {const} */('module'),code:scenario.code}];
      const observer='import {instance} from "./private.mjs";const ctor=instance.constructor;'+
        'console.log(JSON.stringify([ctor.toString(),ctor.value]));';
      const native=await observe(sources,observer);
      const transformed=obfuscateFiles(sources,{
        mode,closedWorld:true,seed:'esm-class-instance-'+mode+'-'+scenario.kind,
        strings:false,properties:scenario.kind==='properties',
        identifiers:scenario.kind==='bindings'
      });
      const result=await observe(transformed.files,observer);
      console.log('ESM_EXPORTED_INSTANCE_CLASS '+JSON.stringify({
        mode,kind:scenario.kind,sourceEqual:result===native,
        propertyRewrites:transformed.files[0].metrics.properties,
        identifierRewrites:transformed.files[0].metrics.bindings,
        valueEqual:JSON.parse(native)[1]===JSON.parse(result)[1]
      }));
      assert.equal(result,native,'Exporting an instance exposes its class constructor source');
    });
  }
}
