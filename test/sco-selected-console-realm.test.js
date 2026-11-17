'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoSelectedGraph}=require('../src');

const entry=[
  'import {compute} from "./private/child.mjs";',
  'export async function protectedOp(){return compute();}',
  'export function visible(){return 7;}'
].join('\n');

/**
 * @param {string} body
 * @returns {import('../src/sco-selected-graph').ScoSelectedGraph}
 */
function compile(body){
  return partitionScoSelectedGraph([{
    file:{path:'mixed.mjs',code:entry,sourceType:'module'},
    options:{
      privateNames:['protectedOp'],
      privateModuleImports:['./private/child.mjs'],
      privateModuleSources:[{
        path:'private/child.mjs',
        code:'export function compute(){'+body+'}'
      }]
    }
  }]);
}

test('SCO private dependencies must decline client-visible console effects',()=>{
  const cases=[
    'console.info("CLIENT_VISIBLE_CANARY");return 7;',
    'const info=console.info;info("CLIENT_VISIBLE_CANARY");return 7;',
    'const {info}=console;info("CLIENT_VISIBLE_CANARY");return 7;',
    'const logger=console;logger.warn("CLIENT_VISIBLE_CANARY");return 7;'
  ];
  for(const body of cases){
    assert.throws(()=>compile(body),/console.*host effect|console.*cross-realm/u,body);
  }
});

test('SCO private dependency preserves genuinely deterministic positive admission',()=>{
  const graph=compile('return Math.imul(6,7);');
  assert.deepEqual(graph.exposedPaths,['mixed.mjs']);
  assert.ok(graph.privatePaths.includes('private/child.mjs'));
  assert.doesNotMatch(graph.clientFiles[0].code,/CLIENT_VISIBLE_CANARY|Math\.imul/u);
});

test('Private host-observation rule does not reject ordinary property labels',()=>{
  const graph=compile('const record={console:41};return record.console+1;');
  assert.deepEqual(graph.exposedPaths,['mixed.mjs']);
});

test('SCO static private children reject unproved client-host reads',()=>{
  const clientRealmOnly=[
    'return window.__applicationMode;',
    'return self.__applicationMode;',
    'return globalThis.__applicationMode;',
    'return document.title;',
    'return navigator.userAgent;',
    'return location.href;',
    'return typeof document;'
  ];
  for(const body of clientRealmOnly){
    assert.throws(()=>compile(body),TypeError,body);
  }
});

test('SCO static private children cannot move debugger breakpoints',()=>{
  assert.throws(()=>compile('debugger;return 42;'),/debugger host effects/u);
});

test('two composed SCO facades cannot share a relocated host-observable dependency',()=>{
  const child={path:'private/child.mjs',
    code:'export function compute(){console.info("CLIENT_VISIBLE_CANARY");return 7;}'};
  const units=['alpha.mjs','beta.mjs'].map(name=>({
    file:{path:name,code:entry,sourceType:'module'},
    options:{
      privateNames:['protectedOp'],privateModuleImports:['./private/child.mjs'],
      privateModuleSources:[child]
    }
  }));
  assert.throws(()=>partitionScoSelectedGraph(units),/console host effects/u);
  const safeUnits=units.map(unit=>({
    file:unit.file,
    options:{...unit.options,privateModuleSources:[{
      path:child.path,code:'export function compute(){return Math.imul(6,7);}'
    }]}
  }));
  const graph=partitionScoSelectedGraph(safeUnits);
  assert.deepEqual(graph.exposedPaths,['alpha.mjs','beta.mjs']);
  assert.deepEqual(graph.privatePaths,['private/child.mjs']);
});
