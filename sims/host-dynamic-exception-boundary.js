'use strict';

const {spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

/**
 * Execute the same candidate source with an opaque host-provided input.
 * @param {string} code
 * @param {unknown} input
 * @returns {{status:number,stdout:string,stderr:string}}
 */
function run(code,input) {
  const prefix=`globalThis.__input=${JSON.stringify(input)};`;
  const child=spawnSync(process.execPath,['-e',prefix+code],{
    encoding:'utf8',
    timeout:3000
  });
  assert.notEqual(child.status,null,'child process did not exit normally');
  const stdout=String(child.stdout);
  const stderr=String(child.stderr);
  return {
    status:/** @type {number} */ (child.status),
    stdout:stdout.replace(/\r\n/g,'\n'),
    stderr:stderr.replace(/\r\n/g,'\n')
  };
}

/**
 * Extract the first generated-source frame column from Node's diagnostic.
 * @param {string} stderr
 * @returns {number}
 */
function evalColumn(stderr) {
  const match=stderr.match(/at \[eval\]:1:(\d+)/);
  assert.ok(match,stderr);
  return Number(match[1]);
}

const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
  "const value=owner.distinctivelyLongPrivateField;const input=globalThis.__input;"+
  "void input.missingField;console.log(value);";
const output=obfuscateFiles([{
  path:'dynamic-host-boundary.cjs',
  sourceType:'commonjs',
  code:source
}],{
  mode:'sno',
  seed:'agent50-dynamic-host-boundary',
  strings:false,
  identifiers:false
}).files[0];
const emitted=String(output.code);

assert.ok(output.metrics.properties>0,emitted);

const safeInput={missingField:1};
const nativeSafe=run(source,safeInput);
const emittedSafe=run(emitted,safeInput);
assert.equal(nativeSafe.status,0,nativeSafe.stderr);
assert.deepEqual(emittedSafe,nativeSafe,output.code);

const nativeFailure=run(source,null);
const emittedFailure=run(emitted,null);
assert.notEqual(nativeFailure.status,0);
assert.equal(emittedFailure.status,nativeFailure.status);
assert.notEqual(emittedFailure.stderr,nativeFailure.stderr,
  'expected current compiler to expose transformed source under opaque null input');

const nativeColumn=evalColumn(nativeFailure.stderr);
const transformedColumn=evalColumn(emittedFailure.stderr);
assert.notEqual(transformedColumn,nativeColumn);

process.stdout.write(JSON.stringify({
  propertyRewrites:output.metrics.properties,
  successStdout:nativeSafe.stdout,
  nativeColumn,
  transformedColumn,
  diagnosticMismatch:true
})+'\n');
