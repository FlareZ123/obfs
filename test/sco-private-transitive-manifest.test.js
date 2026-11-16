'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoSelectedAsyncExports,createScoHandler}=require('../src');

const entry=[
  'import {deriveProof} from "./private/engine.mjs";',
  'export async function protectedDigest(value){return deriveProof(value);}',
  'export function format(value){return String(value).trim();}'
].join('\n');
const engine={
  path:'private/engine.mjs',
  code:'import {secretValue} from "./deep/secret.mjs"; export function deriveProof(value){return secretValue+value;}'
};
const leaf={path:'private/deep/secret.mjs',code:'export const secretValue=41;'};

/**
 * @param {{path:string,code:string}[]} graph
 * @param {string[]} [additionalPrivateModulePaths]
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function emit(graph,additionalPrivateModulePaths=[]) {
  return partitionScoSelectedAsyncExports({path:'mixed.mjs',sourceType:'module',code:entry},{
    seed:'transitive-private-manifest-20261116',privateNames:['protectedDigest'],
    privateModuleImports:['./private/engine.mjs'],
    privateModuleSources:graph,additionalPrivateModulePaths
  });
}

test('closed-world private ESM graph tracks transitive import and reexport paths',()=>{
  const generated=emit([engine,leaf]);
  assert.deepEqual(generated.clientFile.privateModulePaths,[
    'private/engine.mjs','private/deep/secret.mjs'
  ]);
  assert.doesNotMatch(generated.clientFile.code,/secretValue|deriveProof|private\/engine/u);
  assert.throws(()=>createScoHandler([generated.clientFile,leaf]),/must not serve private source/);
  assert.throws(()=>createScoHandler([leaf,generated.clientFile]),/must not serve private source/);
  const throughReexport=emit([
    {...engine,code:'export {secretValue as deriveProof} from "./deep/secret.mjs";'},leaf
  ]);
  assert.ok(throughReexport.clientFile.privateModulePaths.includes(leaf.path));
});

test('closed-world graph rejects missing, extra and ambiguous source paths',()=>{
  assert.throws(()=>emit([engine]),/dependency source missing: private\/deep\/secret\.mjs/);
  assert.throws(()=>emit([engine,leaf,{path:'private/unused.mjs',code:'export const x=1;'}]),
    /exactly the reachable static graph/);
  assert.throws(()=>emit([engine,leaf,{path:'PRIVATE\/engine.mjs',code:engine.code}]),
    /distinct \.mjs paths/);
  assert.throws(()=>emit(/** @type {any} */ (['unexpected'])),/must contain \{path,code\}/);
  assert.throws(()=>emit([engine,leaf],['../escaped.mjs']),/canonical relative \.mjs paths/);
});

test('closed-world graph refuses untracked dynamic and noncanonical loaders',()=>{
  for(const code of [
    'export async function deriveProof(v){return import("./deep/secret.mjs");}',
    'export function deriveProof(v){return require("./deep/secret.mjs");}',
    'export {secretValue as deriveProof} from "../outside.mjs";',
    'import {secretValue} from "package-name"; export {secretValue as deriveProof};',
    'import {secretValue} from "./deep/%73ecret.mjs"; export {secretValue as deriveProof};'
  ]) {
    assert.throws(()=>emit([{...engine,code},leaf]),
      /unproved runtime loader|canonical relative \.mjs imports/,
      'Private source should be declined: '+code);
  }
});

test('private static graph audit remains optional for legacy caller-reviewed paths',()=>{
  const generated=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code:entry},
    {seed:'legacy-direct-20261116',privateNames:['protectedDigest'],
      privateModuleImports:['./private/engine.mjs']}
  );
  assert.deepEqual(generated.clientFile.privateModulePaths,['private/engine.mjs']);
});
