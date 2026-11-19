'use strict';

const {spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

/**
 * Run one source under the default Node 22 unhandled-rejection policy.
 * @param {string} code
 * @param {boolean} fail
 * @returns {{status:number,stdout:string,stderr:string}}
 */
function run(code,fail) {
  const prefix=`globalThis.__fail=${JSON.stringify(fail)};`;
  const child=spawnSync(process.execPath,['-e',prefix+code],{
    encoding:'utf8',
    timeout:3000
  });
  assert.notEqual(child.status,null,'child process did not exit normally');
  return {
    status:/** @type {number} */ (child.status),
    stdout:String(child.stdout).replace(/\r\n/g,'\n'),
    stderr:String(child.stderr).replace(/\r\n/g,'\n')
  };
}

/** @param {string} stderr @returns {number} */
function evalColumn(stderr) {
  const match=stderr.match(/at \[eval\]:1:(\d+)/);
  assert.ok(match,stderr);
  return Number(match[1]);
}

const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
  "const value=owner.distinctivelyLongPrivateField;const fail=globalThis.__fail;"+
  "if(fail)Promise.reject(new Error('probe'));else console.log(value);";
const output=obfuscateFiles([{
  path:'unhandled-rejection-boundary.cjs',
  sourceType:'commonjs',
  code:source
}],{
  mode:'sno',
  seed:'agent50-unhandled-rejection',
  strings:false,
  identifiers:false
}).files[0];
const emitted=String(output.code);

assert.ok(output.metrics.properties>0,emitted);

const nativeSafe=run(source,false);
const emittedSafe=run(emitted,false);
assert.deepEqual(emittedSafe,nativeSafe,emitted);
assert.equal(nativeSafe.status,0,nativeSafe.stderr);
assert.equal(nativeSafe.stdout,'73\n');

const nativeFailure=run(source,true);
const emittedFailure=run(emitted,true);
assert.notEqual(nativeFailure.status,0);
assert.equal(emittedFailure.status,nativeFailure.status);
assert.notEqual(emittedFailure.stderr,nativeFailure.stderr,
  'expected unhandled rejection to expose transformed source coordinates');

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
