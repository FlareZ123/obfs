'use strict';

const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');

/** @type {string[]} */
const targetFiles=[
  'test/bound-runtime-interception.test.js',
  'test/bound-runtime-minifier-control.test.js',
  'test/factory-object-flow.test.js',
  'test/function-declaration-reader-proof.test.js',
  'test/interfile.test.js',
  'test/private-class-source-yield.test.js',
  'test/private-tuple-session.test.js',
  'test/sco-dense-hybrid-matched-http.test.js',
  'test/sno-bound-runtime-interception.test.js',
  'test/source-stable-bound-export.test.js'
];

test('candidate source-paired failure slice',()=>{
  const env={...process.env};
  delete env.NODE_TEST_CONTEXT;
  /** @type {import('node:child_process').SpawnSyncReturns<string>} */
  const result=spawnSync(process.execPath,
    ['--test','--test-reporter=tap',...targetFiles],{
      cwd:process.cwd(),encoding:'utf8',maxBuffer:64*1024*1024,env
    });
  if(result.error)throw result.error;
  const output=(result.stdout??'')+'\n'+(result.stderr??'');
  const lines=output.split(/\r?\n/u);
  const summary=lines.filter(line=>/^# (tests|pass|fail|cancelled|skipped|todo)/u.test(line));
  const failureBlocks=[];
  for(let index=0;index<lines.length;index++) {
    if(lines[index].startsWith('not ok ')) {
      failureBlocks.push(lines.slice(index,Math.min(index+8,lines.length)).join('\n'));
    }
  }
  const receipt={
    commit:process.env.GITHUB_SHA??'unknown',
    node:process.version,
    platform:process.platform,
    status:result.status,
    signal:result.signal,
    targetFiles,
    summary,
    failureBlocks
  };
  process.stdout.write('AGENT3_FAILURE_SLICE '+JSON.stringify(receipt)+'\n');
  assert.equal(result.status,0,
    'the candidate selected failure slice must pass; receipt='+JSON.stringify(receipt));
});
