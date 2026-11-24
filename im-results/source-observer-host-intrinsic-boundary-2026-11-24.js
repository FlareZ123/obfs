'use strict';

// Demonstrate the COO host-intrinsic boundary: a caller-controlled runtime can
// replace Function.prototype.toString before module evaluation. The candidate
// accepts a caller-declared pristine-intrinsics premise but cannot verify it.
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.cwd();
const {obfuscateFiles} = require(path.join(root,'src','core'));

const source = [
  '// UTF-16 coordinate prefix 😀',
  'const privateRecord = { privateField: 7 };',
  'function observed() { return 29; }',
  'const observedSource = Function.prototype.toString.call(observed);',
  "const label = 'safe-literal';",
  'export const result = privateRecord.privateField;',
  'export const sourceText = observedSource;',
  'export const labelText = label;'
].join('\n');

const hostContract = {
  runtimeFamily:'Node.js / V8',
  runtimeVersion:process.versions.node,
  contractVersion:'coo-direct-function-source-v1',
  pristineIntrinsicsPremise:
    'Fresh test realm with unmodified Function.prototype.toString, Function.prototype.call, and String.fromCharCode.'
};

async function importDataModule(code,tag) {
  const url='data:text/javascript;base64,'+Buffer.from(code,'utf8').toString('base64')+'#'+tag;
  return import(url);
}

(async()=>{
  const result=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',
    seed:'agent4-host-intrinsic-boundary',
    strings:true,
    experimentalSourceObservationPlan:hostContract
  });
  const emitted=result.files[0];
  assert.ok(emitted&&typeof emitted.code==='string');
  assert.notEqual(emitted.code,source);
  assert.ok(emitted.metrics.literals>=1);

  const cleanNative=await importDataModule(source,'clean-native');
  const cleanEmitted=await importDataModule(emitted.code,'clean-emitted');
  assert.equal(cleanNative.sourceText,cleanEmitted.sourceText,
    'pristine built-in toString should preserve the source mirror');

  const nativeToString=Function.prototype.toString;
  Function.prototype.toString=function(){
    const stack=new Error().stack||'';
    const frame=stack.split('\n').find(line=>line.includes('data:text/javascript'))||'';
    const match=frame.match(/:(\d+):(\d+)\)?$/u);
    const callsite=match?match[1]+':'+match[2]:'missing-callsite';
    return nativeToString.call(this)+'|callsite='+callsite;
  };

  let hostileNative,hostileEmitted;
  try {
    hostileNative=await importDataModule(source,'hostile-native');
    hostileEmitted=await importDataModule(emitted.code,'hostile-emitted');
  } finally {
    Function.prototype.toString=nativeToString;
  }

  const summary={
    node:process.version,
    properties:emitted.metrics.properties,
    bindings:emitted.metrics.bindings,
    literals:emitted.metrics.literals,
    cleanEqual:true,
    hostileNative:hostileNative.sourceText,
    hostileEmitted:hostileEmitted.sourceText,
    hostileEqual:hostileNative.sourceText===hostileEmitted.sourceText
  };
  process.stdout.write('HOST_INTRINSIC_MUTATION '+JSON.stringify(summary)+'\n');
  assert.notEqual(hostileNative.sourceText,hostileEmitted.sourceText,
    'pre-evaluation host mutation should distinguish native and transformed call sites');
  process.stdout.write('HOST_INTRINSIC_BOUNDARY REPRODUCED\n');
})().catch(error=>{
  Function.prototype.toString=Function.prototype.toString;
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
