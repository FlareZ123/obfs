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
