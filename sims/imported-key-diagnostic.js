'use strict';

const {parse,observesFunctionSource}=require('../src/ast');
const {collectBindings,proveLocalObject}=require('../src/properties');
const {collectVerifiedImportedStrings,renameCrossFileProperties}=require('../src/cross-properties');
const {obfuscateFiles}=require('../src');

const files=[
  {path:'state.mjs',sourceType:'module',code:'export const key="secretField";export const bag={secretField:8};'},
  {path:'main.mjs',sourceType:'module',
    code:'import {bag,key} from "./state.mjs";console.log(bag[key]);'}
];
const inferred=collectVerifiedImportedStrings(files);
const ast=parse(files[1].code,'module');
const bindings=collectBindings(ast);
const proof=proveLocalObject(ast,'bag',bindings,new Map(),new Map(),
  inferred.get('main.mjs'));
const result=renameCrossFileProperties(files,'imported-key-diagnostic');
const compiled=obfuscateFiles(files,{mode:'coo',seed:'imported-key-diagnostic',
  strings:false,identifiers:false,closedWorld:true});
console.log(JSON.stringify({
  inferred:[...inferred].map(([k,v])=>[k,[...v]]),
  sourceObserver:observesFunctionSource(ast,inferred.get('main.mjs')),
  observerWithoutProof:observesFunctionSource(ast),
  bindings:[...bindings],
  proof:proof&&{aliases:[...proof.aliases],members:proof.members.length,
    labels:[...proof.memberNames.values()]},
  cross:{objects:result.objects,properties:result.properties,files:result.files},
  compiled:{crossFile:compiled.crossFile,files:compiled.files.map(f=>({path:f.path,code:f.code}))}
},null,2));
