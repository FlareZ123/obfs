'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @param {'property'|'stream'} sink @returns {ReturnType<typeof obfuscateFiles>} */
function compileGraph(sink) {
  const negativeLogic=[
    'const observedOwner={secretField:57};',
    'export function inspect(){return observedOwner.secretField;}',
    'const independent={independentSecret:73};',
    'export const independentValue=independent.independentSecret;'
  ].join('\n');
  const negativeObserver=sink==='property'?[
    'import {inspect,independentValue} from "./logic.mjs";',
    'const target=document.createElement("div");',
    'target.id=inspect;',
    'export const observed={source:target.id,value:inspect(),independent:independentValue};'
  ].join('\n'):[
    'import {inspect,independentValue} from "./negative-logic.mjs";',
    'const target=document.createElement("div");',
    'const stream=target.streamHTML();',
    'const writer=stream.getWriter();',
    'await writer.write(inspect);',
    'await writer.close();',
    'export const observed={source:target.innerHTML,value:inspect(),independent:independentValue};'
  ].join('\n');
  const positiveLogic=[
    'const owner={privateField:73};',
    'export const independentValue=owner.privateField;'
  ].join('\n');
  const positiveObserver=[
    'import {independentValue} from "./logic.mjs";',
    'const target=document.createElement("div");',
    sink==='property'?'target.id="literal";':
      'const stream=target.streamHTML();const writer=stream.getWriter();await writer.write("literal");await writer.close();',
    'export const observed={independent:independentValue};'
  ].join('\n');
  return obfuscateFiles([
    {path:'negative-logic.mjs',sourceType:'module',code:negativeLogic},
    {path:'negative-observer.mjs',sourceType:'module',code:negativeObserver},
    {path:'positive-logic.mjs',sourceType:'module',code:positiveLogic},
    {path:'positive-observer.mjs',sourceType:'module',code:positiveObserver}
  ],{
    mode:'coo',seed:'esm-dom-source-producer-'+sink,closedWorld:true,
    properties:true,identifiers:true,strings:false
  });
}

for(const sink of /** @type {const} */ (['property','stream'])) {
  test('ESM DOM '+sink+' sink freezes only imported callable producer',()=>{
    const result=compileGraph(sink);
    const negative=result.files.find(file=>file.path==='negative-logic.mjs');
    const positive=result.files.find(file=>file.path==='positive-logic.mjs');
    assert.ok(negative&&positive);
    assert.equal(String(negative.code),[
      'const observedOwner={secretField:57};',
      'export function inspect(){return observedOwner.secretField;}',
      'const independent={independentSecret:73};',
      'export const independentValue=independent.independentSecret;'
    ].join('\n'));
    assert.equal(negative.metrics.properties,0);
    assert.equal(negative.metrics.bindings,0);
    assert.ok(positive.metrics.properties>=1,
      'unrelated primitive-control producer must retain local property rewrite yield');
    assert.ok(!String(positive.code).includes('privateField'),
      'positive-control private property must actually be rewritten');
  });
}


/**
 * Native DOMString coercion must observe the exact imported function source.
 * An immutable intermediate binding must not suppress the producer proof.
 * This test deliberately uses a correctly resolved ESM relative import;
 * an unresolved path would never exercise the runtime contract.
 *
 * @param {'property'|'stream'} sink
 * @param {boolean} alias
 * @returns {import('../src/core').SourceFile[]}
 */
function domAliasGraph(sink,alias) {
  const producer=[
    'const owner={secretField:57};',
    'export function inspect(){return owner.secretField;}'
  ].join('\n');
  const independent=[
    'const record={privateField:73};',
    'export const independent=record.privateField;'
  ].join('\n');
  const consumer=[
    'import {inspect} from "./logic.mjs";',
    'import {independent} from "./pure.mjs";',
    alias?'const indirect=inspect;':'',
    'const target=document.createElement("div");',
    ...(sink==='property'?[
      'target.id='+(alias?'indirect':'inspect')+';',
      'export const observed={source:target.id,value:inspect(),independent};'
    ]:[
      'const stream=target.streamHTML();',
      'const writer=stream.getWriter();',
      'await writer.write('+(alias?'indirect':'inspect')+');',
      'await writer.close();',
      'export const observed={source:target.innerHTML,value:inspect(),independent};'
    ])
  ].filter(Boolean).join('\n');
  return [
    {path:'logic.mjs',sourceType:'module',code:producer},
    {path:'pure.mjs',sourceType:'module',code:independent},
    {path:'observer.mjs',sourceType:'module',code:consumer}
  ];
}

/**
 * Execute the actual emitted ESM graph through a mock host with DOMString
 * setter/writer coercion. The host shim is intentionally outside the
 * declared compiler input, mirroring a native browser host API.
 * @param {import('../src/core').SourceFile[]} files
 * @returns {string}
 */
function executeDomAliasGraph(files) {
  const fs=require('node:fs');
  const os=require('node:os');
  const path=require('node:path');
  const {pathToFileURL}=require('node:url');
  const {spawnSync}=require('node:child_process');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-dom-alias-'));
  try {
    for(const file of files)fs.writeFileSync(path.join(root,file.path),file.code);
    const host=[
      'globalThis.document={createElement(){',
      'let id="",html="";',
      'return {set id(v){id=String(v)},get id(){return id},',
      'get innerHTML(){return html},',
      'streamHTML(){return {getWriter(){return {',
      'async write(v){html=String(v)},async close(){}',
      '}}}}};',
      '}};',
      'const loaded=await import(process.argv[1]);',
      'console.log(JSON.stringify(loaded.observed));'
    ].join('');
    const child=spawnSync(process.execPath,[
      '--input-type=module','-e',host,
      pathToFileURL(path.join(root,'observer.mjs')).href
    ],{cwd:root,encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr || child.error?.message);
    return child.stdout.trim();
  }finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
}

for(const sink of /** @type {const} */ (['property','stream'])) {
  test('ESM DOM '+sink+' callable alias preserves exact host-observed source',()=>{
    /** @type {Array<{mode:string,sink:string,nativeSource:string,emittedSource:string,producerRewrites:number,positiveRewrites:number}>} */
    const mismatches=[];
    for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
      for(const alias of [false,true]) {
        const originals=domAliasGraph(sink,alias);
        const native=executeDomAliasGraph(originals);
        assert.equal(JSON.parse(native).value,57,'native callable controls');
        assert.equal(JSON.parse(native).independent,73,'native primitive controls');
        const result=obfuscateFiles(originals,{
          mode,seed:'dom-alias-falsifier-'+mode+'-'+sink+'-'+alias,
          closedWorld:true,properties:true,identifiers:false,strings:false
        });
        const logic=result.files.find(file=>file.path==='logic.mjs');
        const pure=result.files.find(file=>file.path==='pure.mjs');
        assert.ok(logic&&pure);
        const emitted=executeDomAliasGraph(result.files);
        assert.equal(JSON.parse(emitted).value,57,mode+' numeric output parity');
        assert.equal(JSON.parse(emitted).independent,73,mode+' independent output parity');
        assert.ok(pure.metrics.properties>=1,
          mode+' / '+sink+' / alias='+alias+' unrelated primitive leaf must rewrite');
        if(!alias){
          assert.equal(emitted,native,mode+' / '+sink+' direct-source positive control');
          assert.equal(logic.code,originals[0].code,mode+' direct producer must be unchanged');
          assert.equal(logic.metrics.properties,0,mode+' direct producer rewrite count');
        }else if(emitted!==native || logic.code!==originals[0].code || logic.metrics.properties!==0){
          mismatches.push({
            mode,sink,
            nativeSource:JSON.parse(native).source,
            emittedSource:JSON.parse(emitted).source,
            producerRewrites:logic.metrics.properties,
            positiveRewrites:pure.metrics.properties
          });
        }
      }
    }
    assert.deepEqual(mismatches,[],
      'Each mode must preserve the native DOMString function source through immutable aliases');
  });
}
