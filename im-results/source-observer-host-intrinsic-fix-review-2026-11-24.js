'use strict';

// Verify the narrow FramePosition rollback against both observed host mutations.
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
  seed:'agent4-host-intrinsic-fix-review',
  strings:true,
  experimentalSourceObservationPlan:hostContract
});
const emitted=result.files[0];
assert.ok(emitted&&typeof emitted.code==='string');
assert.ok(emitted.metrics.properties>=1);
assert.ok(emitted.metrics.bindings>=1);
assert.equal(emitted.metrics.literals,0,
  'top-of-file string decoder prologue must be rolled back to preserve reader FramePosition');
assert.ok(emitted.code.includes("'safe-literal'"));
assert.ok(!emitted.code.includes('String.fromCharCode'));

function dataUrl(code,tag) {
  return 'data:text/javascript;base64,'+Buffer.from(code,'utf8').toString('base64')+'#'+tag;
}
async function importDataModule(code,tag) {
  return import(dataUrl(code,tag));
}

(async()=>{
  const cleanNative=await importDataModule(source,'clean-native');
  const cleanEmitted=await importDataModule(emitted.code,'clean-emitted');
  assert.equal(cleanNative.sourceText,cleanEmitted.sourceText);
  assert.equal(cleanNative.labelText,cleanEmitted.labelText);

  const nativeToString=Function.prototype.toString;
  Function.prototype.toString=function(){
    const stack=new Error().stack||'';
    const frame=stack.split('\n').find(line=>line.includes('data:text/javascript'))||'';
    const match=frame.match(/:(\d+):(\d+)\)?$/u);
    const callsite=match?match[1]+':'+match[2]:'missing-callsite';
    return nativeToString.call(this)+'|callsite='+callsite;
  };
  let frameNative,frameEmitted;
  try {
    frameNative=await importDataModule(source,'frame-native');
    frameEmitted=await importDataModule(emitted.code,'frame-emitted');
  } finally {
    Function.prototype.toString=nativeToString;
  }
  assert.equal(frameNative.sourceText,frameEmitted.sourceText,
    'FramePosition guard must preserve the callsite observed by hostile toString');

  const nativeFromCharCode=String.fromCharCode;
  String.fromCharCode=function(...codes) {
    const stack=new Error().stack||'';
    if(stack.includes('data:text/javascript')) {
      return nativeFromCharCode(...codes.map(()=>88));
    }
    return nativeFromCharCode(...codes);
  };
  let stringNative,stringEmitted;
  try {
    stringNative=await importDataModule(source,'string-native');
    stringEmitted=await importDataModule(emitted.code,'string-emitted');
  } finally {
    String.fromCharCode=nativeFromCharCode;
  }
  assert.equal(stringNative.labelText,'safe-literal');
  assert.equal(stringEmitted.labelText,stringNative.labelText,
    'declining decoder insertion must prevent hostile String.fromCharCode corruption');
  assert.equal(stringNative.sourceText,stringEmitted.sourceText);

  process.stdout.write('HOST_INTRINSIC_FIX_REVIEW '+JSON.stringify({
    node:process.version,
    properties:emitted.metrics.properties,
    bindings:emitted.metrics.bindings,
    literals:emitted.metrics.literals,
    frameMutationParity:true,
    stringIntrinsicMutationParity:true,
    exactSource:true,
    outputParity:true
  })+'\n');
  process.stdout.write('HOST_INTRINSIC_FIX_REVIEW PASS\n');
})().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
