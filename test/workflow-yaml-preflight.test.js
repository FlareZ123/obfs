'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parseDocument}=require('yaml');

const workflowDirectory=path.join(__dirname,'..','.github','workflows');

/**
 * Parse an Actions workflow as strict YAML with unique mapping keys.
 * The parser reports malformed scalars as errors rather than accepting an
 * incorrect zero-job workflow as if its code tests had run.
 * @param {string} source
 * @returns {string[]}
 */
function syntaxErrors(source){
  const document=parseDocument(source,{strict:true,uniqueKeys:true});
  return document.errors.map(error=>error.message);
}

test('all repository Actions workflows parse without YAML syntax errors',()=>{
  const files=fs.readdirSync(workflowDirectory)
    .filter(name=>/\.ya?ml$/u.test(name)).sort();
  assert.ok(files.length>0,'Workflow inventory must not be accidentally empty');
  for(const file of files){
    const source=fs.readFileSync(path.join(workflowDirectory,file),'utf8');
    assert.deepEqual(syntaxErrors(source),[],file+' has malformed workflow YAML');
  }
});

test('an unquoted colon-space in a workflow step name fails validation',()=>{
  const malformed=[
    'name: Example',
    'on: workflow_dispatch',
    'jobs:',
    '  probe:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: Reflected Function via top: safe closed-world refusal',
    '        run: echo checking'
  ].join('\n');
  assert.ok(syntaxErrors(malformed).length>0,
    'The historical zero-job YAML scalar must be rejected');
});

test('a quoted colon-space in a workflow step name is valid YAML',()=>{
  const valid=[
    'name: Example',
    'on: workflow_dispatch',
    'jobs:',
    '  probe:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: "Reflected Function via top: safe closed-world refusal"',
    '        run: echo checking'
  ].join('\n');
  assert.deepEqual(syntaxErrors(valid),[]);
});
