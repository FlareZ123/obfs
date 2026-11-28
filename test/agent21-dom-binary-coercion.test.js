'use strict';

/**
 * Test-only adversarial review of an experimental DOM source-provenance guard.
 * Binary + can invoke Function.prototype.toString before a native DOMString
 * setter receives its operand. Compare exact source strings, not just values.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} File */
/** @typedef {{label:string,expression:string}} Case */

/** @type {Case[]} */
const cases=[
  {label:'string-plus-function',expression:'"prefix:"+inspect'},
  {label:'function-plus-string',expression:'inspect+":suffix"'},
  {label:'conditional-string-addition',expression:'true?("prefix:"+inspect):"unreachable"'},
  {label:'String-direct-source',expression:'String(inspect)'},
  {label:'literal-positive-control',expression:'"literal"'}
];

/** @param {Case} sample @returns {File[]} */
function graph(sample) {
  return [
    {path:'logic.mjs',sourceType:'module',
      code:'const owner={secretField:57};export function inspect(){return owner.secretField;}'},
    {path:'pure.mjs',sourceType:'module',
      code:'const record={privateField:73};export const independent=record.privateField;'},
    {path:'observer.mjs',sourceType:'module',
      code:[
        'import {inspect} from "./logic.mjs";',
        'import {independent} from "./pure.mjs";',
        'const target=document.createElement("div");',
        'target.id='+sample.expression+';',
        'export const observed={source:target.id,value:inspect(),independent};'
      ].join('\n')}
  ];
}

/**
 * @param {File[]} files
 * @returns {{source:string,value:number,independent:number}}
 */
function execute(files) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent21-dom-binary-'));
  try {
    for(const file of files)fs.writeFileSync(path.join(root,file.path),file.code);
    const host=[
      'globalThis.document={createElement(){',
      'let id="";return{set id(value){id=String(value)},get id(){return id}};',
      '}};',
      'const loaded=await import(process.argv[1]);',
      'console.log(JSON.stringify(loaded.observed));'
    ].join('');
    const child=spawnSync(process.execPath,[
      '--input-type=module','-e',host,
      pathToFileURL(path.join(root,'observer.mjs')).href
    ],{cwd:root,encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr || child.error?.message);
    return JSON.parse(child.stdout.trim());
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
}

test('DOMString binary function coercion preserves native exact source across COO/SNO/SCO',()=>{
  /** @type {Array<{mode:string,case:string,expected:string,actual:string,producerRewrites:number,positiveRewrites:number}>} */
  const mismatches=[];
  /** @type {Array<{mode:string,case:string,sourceParity:boolean,producerRewrites:number,positiveRewrites:number}>} */
  const classifications=[];
  for(const sample of cases) {
    const original=graph(sample);
    const baseline=execute(original);
    assert.equal(baseline.value,57);
    assert.equal(baseline.independent,73);
    if(sample.label!=='literal-positive-control')
      assert.ok(baseline.source.includes('secretField'),
        sample.label+' must actually source-coerce the imported function');
    else assert.equal(baseline.source,'literal');
    for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
      const built=obfuscateFiles(original,{
        mode,seed:'agent21-dom-binary-source/'+mode+'/'+sample.label,
        closedWorld:true,identifiers:false,strings:false,properties:true
      });
      const actual=execute(built.files);
      const producer=built.files.find(file=>file.path==='logic.mjs');
      const pure=built.files.find(file=>file.path==='pure.mjs');
      assert.ok(producer&&pure);
      assert.equal(actual.value,57,mode+'/'+sample.label+' numeric parity');
      assert.equal(actual.independent,73,mode+'/'+sample.label+' independent value');
      classifications.push({mode,case:sample.label,
        sourceParity:actual.source===baseline.source,
        producerRewrites:producer.metrics.properties,
        positiveRewrites:pure.metrics.properties});
      if(sample.label==='literal-positive-control')assert.ok(
        pure.metrics.properties>=1||producer.metrics.properties>=1,
        mode+' literal sink requires at least one real private-field rename');
      if(actual.source!==baseline.source)mismatches.push({
        mode,case:sample.label,expected:baseline.source,actual:actual.source,
        producerRewrites:producer.metrics.properties,
        positiveRewrites:pure.metrics.properties
      });
    }
  }
  console.log('AGENT21_DOM_BINARY_SOURCE '+JSON.stringify({classifications,mismatches}));
  assert.deepEqual(mismatches,[],
    'Binary + must not evade exact source-provenance protection');
});


/**
 * A top-level constant does not prove a same-named formal parameter primitive.
 * Local callbacks, .call and destructuring can forward an imported callable
 * into a native DOMString sink without a direct named-identifier call.
 *
 * @param {string} statements
 * @returns {File[]}
 */
function shadowedGraph(statements){
  const files=graph({label:'literal-positive-control',expression:'"literal"'});
  const observer=files.find(file=>file.path==='observer.mjs');
  assert.ok(observer);
  observer.code=observer.code.replace('target.id="literal";',statements);
  return files;
}

test('shadowed primitive name and opaque callback routes retain exact imported function source',()=>{
  const variants=[
    {label:'direct-named-call',code:'const value=0;function publish(value){target.id=value;}publish(inspect);'},
    {label:'aliased-named-call',code:'const value=0;function publish(value){target.id=value;}const call=publish;call(inspect);'},
    {label:'function-call-method',code:'const value=0;function publish(value){target.id=value;}publish.call(undefined,inspect);'},
    {label:'reflect-apply',code:'const value=0;function publish(value){target.id=value;}Reflect.apply(publish,undefined,[inspect]);'},
    {label:'for-each-callback',code:'const value=0;function publish(value){target.id=value;}[inspect].forEach(publish);'},
    {label:'destructured-param',code:'const value=0;function publish({value}){target.id=value;}publish({value:inspect});'},
    {label:'class-member-call',code:'const value=0;class P{publish(value){target.id=value;}}new P().publish(inspect);'},
    {label:'arrow-alias-call',code:'const value=0;const publish=(value)=>{target.id=value;};const call=publish;call(inspect);'}
  ];
  /** @type {Array<{mode:string,flow:string,sourceParity:boolean,producerRewrites:number,independentRewrites:number}>} */
  const classifications=[];
  /** @type {Array<{mode:string,flow:string,nativeSource:string,emittedSource:string,producerRewrites:number}>} */
  const mismatches=[];
  for(const variant of variants){
    const original=shadowedGraph(variant.code);
    const native=execute(original);
    assert.equal(native.value,57,variant.label+' native numeric result');
    assert.equal(native.independent,73,variant.label+' unrelated result');
    assert.ok(native.source.includes('secretField'),variant.label+' native source control');
    // A controlled private-property-only mutation keeps callable outputs
    // equal yet must change the observed source: a non-vacuity oracle.
    const counterfactual=original.map(file=>file.path==='logic.mjs'?
      {...file,code:file.code.replaceAll('secretField','controlRenamed')} : file);
    const mutated=execute(counterfactual);
    assert.equal(mutated.value,native.value,variant.label+' mutation numeric control');
    assert.equal(mutated.independent,native.independent,variant.label+' mutation sibling control');
    assert.notEqual(mutated.source,native.source,variant.label+' mutation source sensitivity');
    for(const mode of /** @type {const} */ (['coo','sno','sco'])){
      const result=obfuscateFiles(original,{
        mode,seed:'agent21-shadowed-source/'+mode+'/'+variant.label,
        closedWorld:true,identifiers:false,strings:false,properties:true
      });
      const emitted=execute(result.files);
      const producer=result.files.find(file=>file.path==='logic.mjs');
      const independent=result.files.find(file=>file.path==='pure.mjs');
      assert.ok(producer&&independent);
      assert.equal(emitted.value,57,mode+'/'+variant.label+' result');
      assert.equal(emitted.independent,73,mode+'/'+variant.label+' independent');
      assert.ok(independent.metrics.properties>=1,
        mode+'/'+variant.label+' unrelated primitive must retain a real field rewrite');
      classifications.push({
        mode,flow:variant.label,sourceParity:emitted.source===native.source,
        producerRewrites:producer.metrics.properties,
        independentRewrites:independent.metrics.properties
      });
      if(emitted.source!==native.source)mismatches.push({
        mode,flow:variant.label,nativeSource:native.source,emittedSource:emitted.source,
        producerRewrites:producer.metrics.properties
      });
    }
  }
  console.log('AGENT21_SHADOWED_SOURCE '+JSON.stringify({classifications,mismatches}));
  assert.deepEqual(mismatches,[],
    'A lexically shadowed top-level constant must not suppress source-observer protection');
});
