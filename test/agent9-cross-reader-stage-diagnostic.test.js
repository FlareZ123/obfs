'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,observesFunctionSource,observesDistributedSource}=require('../src/ast');
const {renameLocalProperties}=require('../src/properties');
const {obfuscateFiles}=require('../src/core');
const {original:straightlineSource}=require('../sims/straightline-reader-profile');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @type {SourceFile[]} */
const graph=[
  {path:'owner.mjs',sourceType:'module',code:[
    'const privateRecord={secretAlpha:23,secretBeta:7};',
    'function readAlpha(ownerAlpha){return ownerAlpha.secretAlpha;}',
    'function readBeta(ownerBeta){return ownerBeta.secretBeta;}',
    'export function calculate(k){return k*readAlpha(privateRecord)+readBeta(privateRecord);}'
  ].join('\n')},
  {path:'api.mjs',sourceType:'module',code:[
    'import {calculate} from "./owner.mjs";',
    'export function execute(k){return calculate(k)+calculate(k+1);}'
  ].join('\n')},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {execute} from "./api.mjs";',
    'process.stdout.write(JSON.stringify([execute(0),execute(1),execute(13)]));'
  ].join('\n')}
];

test('isolate cross-file and local reader yield from source detectors',()=>{
  const rows=[];
  const combinations=[
    {label:'local export wrapper with private reader',files:[{
      path:'entry.cjs',sourceType:/** @type {'commonjs'} */ ('commonjs'),code:straightlineSource
    }]},
    {label:'ESM isolated owner',files:[graph[0]]},
    {label:'ESM owner and API',files:[graph[0],graph[1]]},
    {label:'ESM owner API entry',files:graph},
    {label:'ESM owner, entry first',files:[graph[2],graph[0],graph[1]]}
  ];
  for(const {label,files} of combinations) {
    const staged=files.map(file=>{
      const ast=parse(String(file.code),/** @type {'module'|'commonjs'} */(file.sourceType));
      const direct=renameLocalProperties(String(file.code),ast,{seed:'agent9-stage'});
      return {path:file.path,observer:observesFunctionSource(ast),
        distributed:observesDistributedSource(ast),directProperties:direct.properties,
        directObjects:direct.objects};
    });
    /** @type {Array<{mode:string,cross:number,local:Array<{path:string,properties:number,objects:number}>}>} */
    const outputs=[];
    for(const closedWorld of [false,true]){
      for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
        const compiled=obfuscateFiles(files,{
          mode,closedWorld,properties:true,strings:false,identifiers:false,
          seed:'agent9-stage/'+label+'/'+mode+'/'+closedWorld
        });
        outputs.push({mode:mode+(closedWorld?' closed':' open'),
          cross:compiled.crossFile.properties,
          local:compiled.files.map(out=>({path:out.path,
            properties:out.metrics.properties,objects:out.metrics.objects}))});
      }
    }
    rows.push({label,staged,outputs});
  }
  console.log('AGENT9_CROSS_READER_STAGE '+JSON.stringify(rows));
  const positive=rows.find(r=>r.label==='local export wrapper with private reader');
  assert.ok(positive);
  assert.equal(typeof positive.staged[0].directProperties,'number');
});
