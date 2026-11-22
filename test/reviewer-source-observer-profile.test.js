'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const path=require('node:path');
const {ROOT,NAMES}=require('../examples/application-challenge/build.cjs');
const {ablate,withOwnKeyCalls,withCapturedStringArgv}=
  require('../sims/application-challenge-observer-ablation');
const {withPrivateReaderHelpers}=require('../sims/verified-record-session-profile');
const {parse,observesFunctionSource,observesDistributedSource}=require('../src/ast');
const {collectVerifiedImportedStrings,collectVerifiedImportedPrimitives,
  collectVerifiedImportedCloneAliases,collectVerifiedImportedUrlStaticAliases,
  collectImportedFunctionArrays}=require('../src/cross-properties');

test('classify all source-observer triggers in source-safe six-module record variant',async()=>{
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const original=await Promise.all(NAMES.map(async name=>({
    path:name,sourceType:'module',
    code:await fs.readFile(path.join(ROOT,'before',name),'utf8')
  })));
  const sources=withPrivateReaderHelpers(withCapturedStringArgv(withOwnKeyCalls(ablate(original,'both'))));
  const strings=collectVerifiedImportedStrings(sources);
  const primitives=collectVerifiedImportedPrimitives(sources);
  const clones=collectVerifiedImportedCloneAliases(sources);
  const urlStatics=collectVerifiedImportedUrlStaticAliases(sources);
  const arrays=collectImportedFunctionArrays(sources);
  const rows=sources.map(file=>{
    const ast=parse(file.code,'module');
    return {path:file.path,
      distributed:observesDistributedSource(ast,strings.get(file.path)),
      function:observesFunctionSource(ast,strings.get(file.path),clones.get(file.path),
        arrays.get(file.path),primitives.get(file.path),urlStatics.get(file.path)),
      local:observesFunctionSource(ast)};
  });
  process.stdout.write('SOURCE_OBSERVER_PROFILE '+JSON.stringify(rows)+'\n');
  assert.equal(rows.length,NAMES.length);
});
