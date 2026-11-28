'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {{source:string,value:number,independent:number}} Observation */
/**
 * A frozen, source-sensitive ESM workload. The host DOMString conversions live
 * OUTSIDE the declared compiler graph. The original and emitted graphs run
 * against exactly the same host and input, not against an AST approximation.
 *
 * @typedef {{name:string,setup:string,sourceExpression:string}} Shape
 */
/** @type {Shape[]} */
const shapes=[
  {name:'direct-document',setup:[
    'const node=document.createElement("div");','node.id=inspect;'
  ].join(''),sourceExpression:'node.id'},
  {name:'single-document-alias',setup:[
    'const doc=document;','const node=doc.createElement("div");','node.id=inspect;'
  ].join(''),sourceExpression:'node.id'},
  {name:'transitive-document-alias',setup:[
    'const doc1=document;const doc2=doc1;',
    'const node=doc2.createElement("div");node.id=inspect;'
  ].join(''),sourceExpression:'node.id'},
  {name:'local-document-factory',setup:[
    'function make(doc){return doc.createElement("div");}',
    'const node=make(document);node.id=inspect;'
  ].join(''),sourceExpression:'node.id'},
  {name:'callable-local-alias',setup:[
    'const node=document.createElement("div");',
    'const reader=inspect;node.id=reader;'
  ].join(''),sourceExpression:'node.id'},
  {name:'dom-node-alias-positive',setup:[
    'const node=document.createElement("div");',
    'const other=node;other.id=inspect;'
  ].join(''),sourceExpression:'node.id'},
  {name:'set-attribute-method',setup:[
    'const node=document.createElement("div");',
    'node.setAttribute("id",inspect);'
  ].join(''),sourceExpression:'node.id'},
  {name:'reflect-set-method',setup:[
    'const node=document.createElement("div");',
    'Reflect.set(node,"id",inspect);'
  ].join(''),sourceExpression:'node.id'},
  {name:'direct-text-node-constructor',setup:[
    'const node=document.createTextNode(inspect);'
  ].join(''),sourceExpression:'node.textContent'},
  {name:'local-sink-helper',setup:[
    'function put(node,fn){node.id=fn;}',
    'const node=document.createElement("div");put(node,inspect);'
  ].join(''),sourceExpression:'node.id'}
];

/** @param {Shape} shape @returns {SourceFile[]} */
function graph(shape){
  return [
    {path:'logic.mjs',sourceType:'module',
      code:'const owner={secretField:57};export function inspect(){return owner.secretField;}'},
    {path:'pure.mjs',sourceType:'module',
      code:'const record={independentPrivate:73};export const pureValue=record.independentPrivate;'},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {inspect} from "./logic.mjs";',
      'import {pureValue} from "./pure.mjs";',
      shape.setup,
      'console.log(JSON.stringify({source:'+shape.sourceExpression+
        ',value:inspect(),independent:pureValue}));'
    ].join('\n')}
  ];
}

/**
 * Node preloads the host code before importing entry.mjs; host capabilities
 * are not passed to the obfuscator and remain identical for both arms.
 * @param {SourceFile[]} files
 * @returns {Promise<Observation>}
 */
async function execute(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-dom-flow-grid-'));
  try{
    for(const file of files)await fs.writeFile(path.join(dir,file.path),file.code);
    const preload=path.join(dir,'host.mjs');
    await fs.writeFile(preload,[
      'function node(){let id="";return {',
      'set id(x){id=String(x)},get id(){return id},',
      'setAttribute(name,value){if(name==="id")id=String(value)}}}',
      'globalThis.document={',
      'createElement(){return node()},',
      'get body(){return node()},',
      'createTextNode(x){return {textContent:String(x)}}',
      '};'
    ].join('\n'));
    const result=spawnSync(process.execPath,[
      '--import',pathToFileURL(preload).href,path.join(dir,'entry.mjs')
    ],{encoding:'utf8',timeout:10000});
    if(result.error)throw result.error;
    assert.equal(result.status,0,result.stderr);
    return JSON.parse(result.stdout);
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

for(const shape of shapes){
  test('source-observable imported-callable ESM flow: '+shape.name,async()=>{
    const originals=graph(shape);
    const obfuscated=obfuscateFiles(originals,{
      mode:'coo',closedWorld:true,strings:false,properties:true,
      identifiers:false,seed:'agent25-source-flow-grid-'+shape.name
    });
    const independent=obfuscated.files.find(file=>file.path==='pure.mjs');
    assert.ok(independent && independent.metrics.properties>0,
      'The independent primitive owner must undergo a genuine field rewrite');
    assert.ok(!String(independent.code).includes('independentPrivate'));
    const native=await execute(originals);
    const emitted=await execute(/** @type {SourceFile[]} */(obfuscated.files));
    assert.deepEqual(native,{source:native.source,value:57,independent:73});
    assert.ok(native.source.includes('secretField'),
      'Actual original host must observe the source of the imported function');
    assert.deepEqual(emitted,native,
      'A local numeric equality is insufficient when a host coerces a callable to DOMString');
    assert.equal(obfuscated.files.find(file=>file.path==='logic.mjs')?.code,
      originals[0].code,'The source-observed producer must remain byte-for-byte unchanged');
  });
}
