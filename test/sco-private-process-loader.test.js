'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoSelectedAsyncExports}=require('../src');

const entry=[
  'import {deriveProof} from "./private/engine.mjs";',
  'export async function protectedDigest(value){return deriveProof(value);}',
  'export function display(value){return String(value);}'
].join('\n');

/**
 * Build a private graph with precisely one explicitly supplied dependency.
 * Admission must refuse any dependency that can load unlisted source through
 * a known ambient Node module loader.
 *
 * @param {string} code
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function compile(code){
  return partitionScoSelectedAsyncExports({
    path:'entry.mjs',sourceType:'module',code:entry
  },{
    seed:'private-process-loader-regression',
    privateNames:['protectedDigest'],
    privateModuleImports:['./private/engine.mjs'],
    privateModuleSources:[{path:'private/engine.mjs',code}]
  });
}

test('Node 22 process builtin module access is a real indirect loader',()=>{
  const builtin=process.getBuiltinModule('module');
  assert.ok(builtin);
  assert.equal(typeof builtin.createRequire,'function');
});

test('private static graph refuses process-origin indirect loaders and aliases',()=>{
  const programs=[
    'const mod=process.getBuiltinModule("module"); export function deriveProof(v){return mod.createRequire(process.cwd()+"/index.cjs")("./unlisted.cjs")(v);}',
    'const mod=process.mainModule; export function deriveProof(v){return mod.require("./unlisted.cjs")(v);}',
    'const p=process; export function deriveProof(v){return p.getBuiltinModule("module");}',
    'const p=globalThis.process; export function deriveProof(v){return p.getBuiltinModule("module");}',
    'const root=globalThis; const p=root.process; export function deriveProof(v){return p.getBuiltinModule("module");}',
    'const load=process.getBuiltinModule; export function deriveProof(v){return load("module");}',
    'const {getBuiltinModule:load}=process; export function deriveProof(v){return load("module");}',
    'let load; ({getBuiltinModule:load}=process); export function deriveProof(v){return load("module");}'
  ];
  for(const code of programs){
    assert.throws(()=>compile(code),/cross-realm global state|unproved runtime loader/u,
      'Compiler admitted an ambient Node module loader: '+code);
  }
});

test('private static graph keeps explicit crypto imports and inert environment values',()=>{
  const safe=compile([
    'import {createHash} from "node:crypto";',
    'const suffix=process.env.SCO_TEST_SUFFIX;',
    'export function deriveProof(v){return createHash("sha256").update(v+suffix).digest("hex");}'
  ].join('\n'));
  assert.deepEqual(safe.clientFile.privateModulePaths,['private/engine.mjs']);
  assert.doesNotMatch(safe.clientFile.code,/SCO_TEST_SUFFIX|createHash|node:crypto/u);
});
