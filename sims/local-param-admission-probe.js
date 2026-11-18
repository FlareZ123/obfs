'use strict';

const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource,observesDistributedSource}=require('../src/ast');

/** @typedef {{path:string,sourceType:'module',code:string}} Source */
/** @type {Source[]} */
const graph=[
  {path:'private.mjs',sourceType:'module',code:
    'export function compute(payload){const owner={payload,bias:3};'+
    'return globalThis.HOST.externalValue(owner.payload+owner.bias);}'},
  {path:'host.mjs',sourceType:'module',code:
    'globalThis.HOST={externalValue(number){globalThis.events.push(number);return number*2;}};'},
  {path:'entry.mjs',sourceType:'module',code:
    'import "./host.mjs";import {compute} from "./private.mjs";'+
    'globalThis.events=[];console.log(JSON.stringify({result:compute(39),events:globalThis.events}));'}
];
/** @type {Array<{name:string,files:Source[]}>} */
const variants=[
  {name:'original-three',files:graph},
  {name:'wrapped-private-only',files:[{
    path:'private.mjs',sourceType:'module',code:
      graph[0].code.replace('export function compute(payload)','function compute(payload)')+
      'export function invoke(payload){return compute(payload);}'
  }]},
  {name:'wrapped-three',files:[
    {path:'private.mjs',sourceType:'module',code:
      graph[0].code.replace('export function compute(payload)','function compute(payload)')+
      'export function invoke(payload){return compute(payload);}'},
    graph[1],
    {...graph[2],code:graph[2].code.replace('{compute}','{invoke}').replace('result:compute(39)','result:invoke(39)')}
  ]},
  {name:'wrapped-two-dom',files:[
    {path:'private.mjs',sourceType:'module',code:
      'function compute(payload){const owner={payload,bias:3};return owner.payload+owner.bias;}' +
      'export function invoke(payload){return compute(payload);}'},
    {path:'entry.mjs',sourceType:'module',code:
      'import {invoke} from "./private.mjs";document.getElementById("answer").textContent=invoke(39);'}
  ]},
    {name:'private-only',files:graph.slice(0,1)},
  {name:'without-host-setup',files:[graph[0],graph[2]]},
  {name:'host-setup-only',files:[graph[0],graph[1]]},
  {name:'original-three-direct-local-call',files:[
    {...graph[0],code:graph[0].code.replace('globalThis.HOST.externalValue(owner.payload+owner.bias)','owner.payload+owner.bias')},
    graph[1],graph[2]
  ]},
  {name:'no-global-host-setup',files:[
    graph[0],
    {...graph[1],code:'export const host=3;'},
    {...graph[2],code:'import {compute} from "./private.mjs";console.log(compute(39));'}
  ]},
  {name:'two-module-compute',files:[
    {path:'private.mjs',sourceType:'module',code:
       'export function compute(payload){const owner={payload,bias:3};return owner.payload+owner.bias;}'},
    {path:'entry.mjs',sourceType:'module',code:
       'import {compute} from "./private.mjs";console.log(compute(39));'}
  ]},
  {name:'two-module-dom',files:[
    {path:'private.mjs',sourceType:'module',code:
       'export function compute(payload){const owner={payload,bias:3};return owner.payload+owner.bias;}'},
    {path:'entry.mjs',sourceType:'module',code:
       'import {compute} from "./private.mjs";document.getElementById("answer").textContent=compute(39);'}
  ]}
];
for(const variant of variants){
  const markers=variant.files.map(file=>{
    const ast=parse(file.code,'module');
    return {file:file.path,functionObserver:observesFunctionSource(ast),
      sourceObserver:observesDistributedSource(ast)};
  });
  for(const closedWorld of [false,true]){
    const output=obfuscateFiles(variant.files,{mode:'coo',closedWorld,
      seed:'diagnose-parameter',identifiers:false,strings:false,properties:true});
    const counts=output.files.map(file=>({path:file.path,objects:file.metrics.objects,
      properties:file.metrics.properties,changed:file.code!==variant.files.find(x=>x.path===file.path)?.code}));
    console.log('FORMAL_VALUE_PROBE '+JSON.stringify({name:variant.name,closedWorld,markers,
      cross:output.crossFile,counts}));
  }
}
