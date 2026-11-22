'use strict';

const {test}=require('node:test');
const {parse,observesFunctionSource,observesDistributedSource}=require('../src/ast');
const {obfuscateFiles}=require('../src');

/**
 * Reproduction-oriented source-observer diagnosis; this is an exploratory
 * candidate branch and is not intended as a release test.
 */
test('inspect reader guards for ordinary versus DOM-returning imported factories',()=>{
  const source='globalThis.importedDynamicDigestSRI="original script bytes matter across modules";';
  const digest='pinned-value-not-a-static-hash-in-source';
  for(const [kind,factory] of [
    ['dom','export function build(){return document.createElement("script");}'],
    ['object','export function build(){return {src:""};}']
  ]){
    const entry='import {build} from "./factory.mjs";'+
      'const target=build();target.src="./client.js";'+
      'const attr=globalThis.injectedAttribute||"integrity";'+
      'const digest=globalThis.injectedDigest||'+JSON.stringify(digest)+';'+
      'target[attr]="sha256-"+digest;document.head.append(target);';
    const files=[
      {path:'client.js',sourceType:/** @type {const} */('script'),code:source},
      {path:'factory.mjs',sourceType:/** @type {const} */('module'),code:factory},
      {path:'entry.mjs',sourceType:/** @type {const} */('module'),code:entry},
      {path:'index.html',sourceType:/** @type {const} */('asset'),
        code:Buffer.from('<script type="module" src="./entry.mjs"></script>')}
    ];
    const output=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,strings:true,identifiers:false,
      properties:false,seed:'imported-runtime-diagnostic'
    });
    const entryAst=parse(entry,'module');
    const factoryAst=parse(factory,'module');
    process.stdout.write('INTERFILE_SOURCE_OBSERVER_DIAGNOSTIC '+JSON.stringify({
      kind,transformed:output.files[0].code!==source,
      entrySource:observesDistributedSource(entryAst),
      entryFunction:observesFunctionSource(entryAst),
      factorySource:observesDistributedSource(factoryAst),
      factoryFunction:observesFunctionSource(factoryAst)
    })+'\n');
  }
});
