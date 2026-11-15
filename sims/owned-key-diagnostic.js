'use strict';

const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');
const {collectBindings,proveLocalObject}=require('../src/properties');
const {renameCrossFileProperties}=require('../src/cross-properties');

const files=[
  {path:'state.mjs',sourceType:'module',code:'const key="secretField";export const bag={secretField:8};console.log("state",bag[key]);'},
  {path:'identity.mjs',sourceType:'module',code:'export const identity=x=>x;'},
  {path:'main.mjs',sourceType:'module',code:'import {bag} from "./state.mjs";import {identity} from "./identity.mjs";const x=identity(bag);console.log("main",x.secretField);'}
];

/** @param {string} label @param {string} code @param {string} root @param {Map<string,number>} imports */
function check(label,code,root,imports) {
  const ast=parse(code,'module');
  const proof=proveLocalObject(ast,root,collectBindings(ast),imports);
  return {label,sourceObserver:observesFunctionSource(ast),
    ownProof:proof===null?null:{aliases:[...proof.aliases],members:proof.members.length,
      memberNames:[...proof.memberNames.values()],patterns:proof.patterns.length}};
}

const evidence=[
  check('state',files[0].code,'bag',new Map()),
  check('main',files[2].code,'bag',new Map([['identity',0]]))
];
const cross=renameCrossFileProperties(files,'owned-key-diagnostic');
const mode=obfuscateFiles(files,{mode:'coo',closedWorld:true,seed:'owned-key-diagnostic',
  strings:false,identifiers:false});
console.log(JSON.stringify({evidence,cross:{objects:cross.objects,properties:cross.properties,
  files:cross.files.map(file=>({path:file.path,code:file.code}))},
  integrated:{crossFile:mode.crossFile,files:mode.files.map(file=>({path:file.path,code:file.code}))}},null,2));
