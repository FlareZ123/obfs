'use strict';

// Exercise the FramePosition guard through V8's structured Error.prepareStackTrace API.
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
  seed:'agent4-structured-callsite-review',
  strings:true,
  experimentalSourceObservationPlan:hostContract
});
const emitted=result.files[0];
assert.ok(emitted&&typeof emitted.code==='string');
assert.equal(emitted.metrics.literals,0);
assert.ok(emitted.metrics.properties>=1);
assert.ok(emitted.metrics.bindings>=1);

function dataUrl(code,tag) {
  return 'data:text/javascript;base64,'+Buffer.from(code,'utf8').toString('base64')+'#'+tag;
}
const nativeUrl=dataUrl(source,'callsite-native');
const emittedUrl=dataUrl(emitted.code,'callsite-emitted');

(async()=>{
  const originalToString=Function.prototype.toString;
  const originalPrepareStackTrace=Error.prepareStackTrace;
  Error.prepareStackTrace=(_error,frames)=>frames;
  Function.prototype.toString=function(){
    const frames=new Error().stack;
    assert.ok(Array.isArray(frames),'custom prepareStackTrace should return structured CallSites');
    const frame=frames.find(site=>{
      const file=site.getFileName?.()||site.getScriptNameOrSourceURL?.()||'';
      return file.startsWith('data:text/javascript');
    });
    assert.ok(frame,'module reader callsite should be present in structured stack');
    const metadata=[
      frame.getLineNumber?.()??'null',
      frame.getColumnNumber?.()??'null',
      frame.getFunctionName?.()??'null',
      frame.getTypeName?.()??'null'
    ].join(':');
    return originalToString.call(this)+'|callsite='+metadata;
  };

  let native,compiled;
  try {
    native=await import(nativeUrl);
    compiled=await import(emittedUrl);
  } finally {
    Function.prototype.toString=originalToString;
    Error.prepareStackTrace=originalPrepareStackTrace;
  }
  assert.equal(native.sourceText,compiled.sourceText);
  assert.equal(native.result,compiled.result);
  assert.equal(native.labelText,compiled.labelText);
  process.stdout.write('STRUCTURED_CALLSITE_FIX_REVIEW '+JSON.stringify({
    node:process.version,
    properties:emitted.metrics.properties,
    bindings:emitted.metrics.bindings,
    literals:emitted.metrics.literals,
    nativeSource:native.sourceText,
    emittedSource:compiled.sourceText,
    sourceParity:true,
    outputParity:true
  })+'\n');
  process.stdout.write('STRUCTURED_CALLSITE_FIX_REVIEW PASS\n');
})().catch(error=>{
  Function.prototype.toString=Function.prototype.toString;
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
