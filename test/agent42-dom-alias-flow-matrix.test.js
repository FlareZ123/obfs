'use strict';

/**
 * Executable, multi-mode DOMString function-source provenance matrix.
 * All samples are valid static ESM graphs. Original and emitted graphs run
 * through an external host setter performing the exact String(value) operation,
 * so numeric return-value agreement cannot hide source-text divergences.
 *
 * The suite intentionally includes unsupported provenance patterns to
 * falsify incomplete admission analyses; do not count a red run as a fix.
 */
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');

/** @typedef {'coo'|'sno'|'sco'} Mode */
/** @typedef {{path:string,sourceType:'module',code:string}} File */
/** @typedef {{label:string,setup:string,expression:string,imports?:string,callable?:string,extra?:File[],assigned?:boolean}} Case */

/** @type {Case[]} */
const cases=[
  {label:'direct',setup:'',expression:'inspect'},
  {label:'immutable-alias',setup:'const forwarded=inspect;',expression:'forwarded'},
  {label:'immutable-chain',setup:'const a=inspect;const forwarded=a;',expression:'forwarded'},
  {label:'mutable-assignment',setup:'let forwarded;forwarded=inspect;',expression:'forwarded'},
  {label:'object-property',setup:'const holder={fn:inspect};',expression:'holder.fn'},
  {label:'array-index',setup:'const holder=[inspect];',expression:'holder[0]'},
  {label:'object-assignment',setup:'const holder={};holder.fn=inspect;',expression:'holder.fn'},
  {label:'object-alias',setup:'const a={fn:inspect};const holder=a;',expression:'holder.fn'},
  {label:'destructure',setup:'const {fn:forwarded}={fn:inspect};',expression:'forwarded'},
  {label:'conditional',setup:'const forwarded=true?inspect:undefined;',expression:'forwarded'},
  {label:'local-return',setup:'function identity(x){return x;}',expression:'identity(inspect)'},
  {label:'closure-return',setup:'function identity(){return inspect;}',expression:'identity()'},
  {label:'arrow-return',setup:'const identity=()=>inspect;',expression:'identity()'},
  {label:'callback-parameter',setup:'function publish(x){target.id=x;}publish(inspect);',
    expression:'',assigned:true},
  {label:'namespace-import',setup:'',imports:'import * as api from "./logic.mjs";',
    expression:'api.inspect',callable:'api.inspect()'},
  {label:'barrel-reexport',setup:'',imports:'import {inspect} from "./barrel.mjs";',
    expression:'inspect',extra:[{
      path:'barrel.mjs',sourceType:'module',code:'export {inspect} from "./logic.mjs";'
    }]}
];

/** @param {Case} sample @returns {File[]} */
function graph(sample){
  const imports=sample.imports??'import {inspect} from "./logic.mjs";';
  const body=[
    imports,
    'import {independent} from "./pure.mjs";',
    'const target=document.createElement("div");',
    sample.setup,
    sample.assigned?'':'target.id='+sample.expression+';',
    'export const observed={source:target.id,value:'+(sample.callable??'inspect()')+
      ',independent};'
  ].filter(Boolean).join('\n');
  return [
    {path:'logic.mjs',sourceType:'module',code:
      'const owner={secretField:57};export function inspect(){return owner.secretField;}'},
    {path:'pure.mjs',sourceType:'module',code:
      'const record={privateField:73};export const independent=record.privateField;'},
    ...(sample.extra??[]),
    {path:'observer.mjs',sourceType:'module',code:body}
  ];
}

/** @param {File[]} files @returns {{source:string,value:number,independent:number}} */
function executeGraph(files){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'dom-alias-flow-'));
  try {
    for(const file of files)fs.writeFileSync(path.join(root,file.path),file.code);
    const host=[
      'globalThis.document={createElement(){',
      'let id="";return{set id(v){id=String(v)},get id(){return id}};',
      '}};',
      'const data=await import(process.argv[1]);',
      'console.log(JSON.stringify(data.observed));'
    ].join('');
    const job=spawnSync(process.execPath,[
      '--input-type=module','-e',host,
      pathToFileURL(path.join(root,'observer.mjs')).href
    ],{encoding:'utf8',cwd:root,timeout:15000});
    assert.equal(job.status,0,job.stderr || job.error?.message);
    return JSON.parse(job.stdout.trim());
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}

test('ESM DOMString provenance across local carriers and interprocedural values',()=>{
  /** @type {Array<{mode:Mode,flow:string,originalSource:string,emittedSource:string,producerRewrites:number,independentRewrites:number}>} */
  const failures=[];
  /** @type {Array<{mode:Mode,flow:string,passed:boolean,producerRewrites:number,independentRewrites:number}>} */
  const summary=[];
  for(const sample of cases){
    const original=graph(sample);
    const expected=executeGraph(original);
    assert.equal(expected.source,'function inspect(){return owner.secretField;}',
      sample.label+' source baseline');
    assert.equal(expected.value,57,sample.label+' baseline value');
    assert.equal(expected.independent,73,sample.label+' baseline independent');
    for(const mode of /** @type {const} */ (['coo','sno','sco'])){
      const result=obfuscateFiles(original,{
        mode,seed:'dom-alias-flow-matrix/'+mode+'/'+sample.label,
        closedWorld:true,identifiers:false,strings:false,properties:true
      });
      const observed=executeGraph(result.files);
      assert.equal(observed.value,57,mode+'/'+sample.label+' return-value parity');
      assert.equal(observed.independent,73,mode+'/'+sample.label+' independent value');
      const producer=result.files.find(f=>f.path==='logic.mjs');
      const unrelated=result.files.find(f=>f.path==='pure.mjs');
      assert.ok(producer&&unrelated);
      assert.ok(unrelated.metrics.properties>=1,
        mode+'/'+sample.label+' unrelated property rewrite positive control');
      const passed=observed.source===expected.source;
      summary.push({
        mode,flow:sample.label,passed,
        producerRewrites:producer.metrics.properties,
        independentRewrites:unrelated.metrics.properties
      });
      if(!passed)failures.push({
        mode,flow:sample.label,
        originalSource:expected.source,emittedSource:observed.source,
        producerRewrites:producer.metrics.properties,
        independentRewrites:unrelated.metrics.properties
      });
    }
  }
  console.log('DOM_ALIAS_FLOW_MATRIX '+JSON.stringify({summary,failures}));
  assert.deepEqual(failures,[],
    'Obfuscator must preserve exact host-coerced function source through every valid local alias/carrier and return');
});
