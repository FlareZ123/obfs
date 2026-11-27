'use strict';

// Reproduce the unverified String.fromCharCode premise under the COO runtime model.
const assert=require('node:assert/strict');
const path=require('node:path');
const root=process.cwd();
const {obfuscateFiles}=require(path.join(root,'src','core'));

const source=[
  '// UTF-16 coordinate prefix 😀',
  'const privateRecord = { privateField: 7 };',
  'function observed() { return 29; }',
  'const observedSource = Function.prototype.toString.call(observed);',
  "const label = 'safe-literal';",
  'export const result = privateRecord.privateField;',
  'export const sourceText = observedSource;',
  'export const labelText = label;'
].join('\n');
const hostContract={
  runtimeFamily:'Node.js / V8',
  runtimeVersion:process.versions.node,
  contractVersion:'coo-direct-function-source-v1',
  pristineIntrinsicsPremise:
    'Fresh test realm with unmodified Function.prototype.toString, Function.prototype.call, and String.fromCharCode; declared compatibility premise only.'
};
const result=obfuscateFiles([{
  path:'entry.mjs',sourceType:'module',code:source
}],{
  mode:'coo',
  seed:'agent4-string-intrinsic-boundary',
  strings:true,
  experimentalSourceObservationPlan:hostContract
});
const emitted=result.files[0];
assert.ok(emitted&&typeof emitted.code==='string');
assert.ok(emitted.metrics.literals>=1);

function dataUrl(code,tag) {
  return 'data:text/javascript;base64,'+Buffer.from(code,'utf8').toString('base64')+'#'+tag;
}

(async()=>{
  const nativeUrl=dataUrl(source,'native-clean');
  const emittedUrl=dataUrl(emitted.code,'emitted-clean');
  const cleanNative=await import(nativeUrl);
  const cleanEmitted=await import(emittedUrl);
  assert.equal(cleanNative.labelText,cleanEmitted.labelText);
  assert.equal(cleanNative.sourceText,cleanEmitted.sourceText);

  const originalFromCharCode=String.fromCharCode;
  String.fromCharCode=function(...codes) {
    const stack=new Error().stack||'';
    if(stack.includes('data:text/javascript')) {
      return originalFromCharCode(...codes.map(()=>88));
    }
    return originalFromCharCode(...codes);
  };
  let hostileNative,hostileEmitted;
  try {
    hostileNative=await import(dataUrl(source,'native-hostile'));
    hostileEmitted=await import(dataUrl(emitted.code,'emitted-hostile'));
  } finally {
    String.fromCharCode=originalFromCharCode;
  }

  const summary={
    node:process.version,
    properties:emitted.metrics.properties,
    bindings:emitted.metrics.bindings,
    literals:emitted.metrics.literals,
    cleanLabel:cleanNative.labelText,
    hostileNativeLabel:hostileNative.labelText,
    hostileEmittedLabel:hostileEmitted.labelText,
    hostileLabelsEqual:hostileNative.labelText===hostileEmitted.labelText,
    hostileSourceEqual:hostileNative.sourceText===hostileEmitted.sourceText
  };
  process.stdout.write('STRING_INTRINSIC_MUTATION '+JSON.stringify(summary)+'\n');
  assert.equal(hostileNative.labelText,'safe-literal');
  assert.notEqual(hostileEmitted.labelText,hostileNative.labelText,
    'pre-evaluation String.fromCharCode mutation should corrupt the encoded literal');
  process.stdout.write('STRING_INTRINSIC_BOUNDARY REPRODUCED\n');
})().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
