'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createSnoLauncher}=require('../src/sno');
const {obfuscateFiles}=require('../src');

/**
 * A Node host callback can inspect an otherwise unexported direct-call-only
 * caller via structured CallSite frames. The callback is deliberately supplied
 * by the execution host and is absent from the compiled source graph.
 * @param {string} code
 * @returns {{value:number,source:string}}
 */
/**
 * Construct a sloppy external host callback that inspects its synchronous
 * caller. The test module is strict; source observation requires a separate
 * sloppy host function to avoid V8's strict-frame privacy rule.
 * @param {{source:string}} observed
 * @returns {() => void}
 */
function createHostCallback(observed) {
  return /** @type {() => void} */(vm.runInNewContext(
    '(function hostCallback(){'+
      'const previous=Error.prepareStackTrace;'+
      'try{Error.prepareStackTrace=(_error,frames)=>{'+
        'const caller=frames.find(frame=>frame.getFunctionName()==="readPrivate");'+
        'observed.source=caller?String(caller.getFunction()):"";return "";'+
      '};void new Error("caller-source-probe").stack;}'+
      'finally{if(previous===undefined)delete Error.prepareStackTrace;'+
        'else Error.prepareStackTrace=previous;}})',
    {Error,observed}
  ));
}

/**
 * @param {string} code
 * @returns {{value:number,source:string}}
 */
function execute(code) {
  const observed={source:''};
  const module={exports:0};
  const hostCallback=createHostCallback(observed);
  // A sloppy external getter can invoke the host callback without an
  // explicit CallExpression in the protected function's source.
  const externalObserver=vm.runInNewContext(
    '({get trigger(){hostCallback();return 0;}})',{hostCallback}
  );
  const ambientGetter=/** @type {() => number} */(vm.runInNewContext(
    '(function ambientGetter(){hostCallback();return 0;})',{hostCallback}
  ));
  const hostScope={module,hostCallback,externalObserver};
  Object.defineProperty(hostScope,'ambientValue',{get:ambientGetter});
  vm.runInNewContext(code,hostScope,{timeout:3000});
  return {value:module.exports,source:observed.source};
}

/**
 * @param {string} source
 * @param {'coo'|'sno'|'sco'} mode
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(source,mode) {
  return obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:source}],{
    mode,seed:'callsite-host-source-'+mode,properties:true,identifiers:false,
    strings:false
  }).files[0];
}

const observableSource=
  'const owner={privateSecret:31};'+
  'function readPrivate(){hostCallback();return owner.privateSecret;}'+
  'module.exports=readPrivate();';
const ordinarySource=
  'const owner={privateSecret:31};'+
  'function readPrivate(){return owner.privateSecret;}'+
  'module.exports=readPrivate();';

for(const mode of /** @type {const} */(['coo','sno','sco'])) {
  test(mode+' host-supplied CallSite.getFunction must preserve caller source',()=>{
    const before=execute(observableSource);
    const output=compile(observableSource,mode);
    const after=execute(/** @type {string} */(output.code));
    process.stdout.write('CALLSITE_DIRECT_ONLY '+JSON.stringify({
      mode,metrics:output.metrics,nativeSource:before.source,
      emittedSource:after.source,nativeValue:before.value,
      emittedValue:after.value
    })+'\n');
    assert.equal(before.value,31);
    assert.equal(after.value,before.value);
    assert.match(before.source,/owner\.privateSecret/);
    assert.equal(output.metrics.properties,0,
      'A source-observed owner must remain unchanged');
    assert.equal(after.source,before.source,
      'A host callback must not observe changed caller function-source bytes');
  });

  test(mode+' direct-only private helper without an observer retains positive property yield',()=>{
    const output=compile(ordinarySource,mode);
    assert.ok(output.metrics.properties>=1,
      'A genuinely private direct-only caller should remain transformable');
    assert.equal(execute(/** @type {string} */(output.code)).value,
      execute(ordinarySource).value);
  });
  test(mode+' strict-mode caller masks structured source observation',()=>{
    const source="'use strict';"+observableSource;
    const before=execute(source);
    const output=compile(source,mode);
    const after=execute(/** @type {string} */(output.code));
    process.stdout.write('CALLSITE_STRICT_BOUNDARY '+JSON.stringify({
      mode,properties:output.metrics.properties,nativeSource:before.source,
      emittedSource:after.source,nativeValue:before.value,
      emittedValue:after.value
    })+'\n');
    assert.equal(before.source,'undefined',
      'Node/V8 strict stack frames should not expose caller function objects');
    assert.equal(after.source,before.source);
    assert.equal(after.value,before.value);
  });

}


test('actual SNO CommonJS launcher must preserve externally observed caller source',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-sno-callsite-'));
  const nativeDir=path.join(root,'native');
  const compiledDir=path.join(root,'compiled');
  const before={source:''};
  const after={source:''};
  const oldHost=Object.getOwnPropertyDescriptor(globalThis,'hostCallback');
  try {
    fs.mkdirSync(nativeDir);
    fs.mkdirSync(compiledDir);
    fs.writeFileSync(path.join(nativeDir,'case.cjs'),observableSource);
    const emitted=compile(observableSource,'sno');
    fs.writeFileSync(path.join(compiledDir,'case.cjs'),emitted.code);
    fs.writeFileSync(path.join(compiledDir,'sno-entry.cjs'),
      createSnoLauncher([{path:'case.cjs',code:emitted.code}],'case.cjs'));
    Object.defineProperty(globalThis,'hostCallback',{
      value:createHostCallback(before),configurable:true
    });
    const nativeValue=/** @type {number} */(require(path.join(nativeDir,'case.cjs')));
    Object.defineProperty(globalThis,'hostCallback',{
      value:createHostCallback(after),configurable:true
    });
    const compiledValue=/** @type {number} */(require(path.join(compiledDir,'sno-entry.cjs')));
    process.stdout.write('CALLSITE_SNO_LAUNCHER '+JSON.stringify({
      properties:emitted.metrics.properties,nativeValue,compiledValue,
      nativeSource:before.source,emittedSource:after.source
    })+'\n');
    assert.equal(nativeValue,31);
    assert.equal(compiledValue,nativeValue);
    assert.equal(emitted.metrics.properties,0,
      'The SNO entry should preserve its source-observed owner');
    assert.match(before.source,/owner\.privateSecret/);
    assert.equal(after.source,before.source,
      'The verified SNO launch path should preserve externally observed function source');
  } finally {
    if(oldHost)Object.defineProperty(globalThis,'hostCallback',oldHost);
    else Reflect.deleteProperty(globalThis,'hostCallback');
    fs.rmSync(root,{recursive:true,force:true});
  }
});


test('equal-trust ordinary esbuild property-mangling control also changes observed caller source',()=>{
  const {transformSync}=require('esbuild');
  const transformed=transformSync(observableSource,{
    loader:'js',mangleProps:/^privateSecret$/,minify:false
  }).code;
  const native=execute(observableSource);
  const mangled=execute(transformed);
  process.stdout.write('CALLSITE_ESBUILD_CONTROL '+JSON.stringify({
    nativeValue:native.value,mangledValue:mangled.value,
    nativeSource:native.source,mangledSource:mangled.source
  })+'\n');
  assert.equal(native.value,31);
  assert.equal(mangled.value,native.value);
  assert.match(native.source,/owner\.privateSecret/);
  assert.match(mangled.source,/owner\.(?!privateSecret)\w+/);
  assert.notEqual(mangled.source,native.source);
});


test('selective host-caller source closure should preserve an independent owner rewrite',()=>{
  const source='const observedOwner={observedSecret:31};'+
    'function readPrivate(){hostCallback();return observedOwner.observedSecret;}'+
    'const independentOwner={unrelatedSecret:73};'+
    'module.exports=readPrivate()+independentOwner.unrelatedSecret;';
  const original=execute(source);
  const emitted=compile(source,'sno');
  const actual=execute(/** @type {string} */(emitted.code));
  process.stdout.write('CALLSITE_DISJOINT_OWNER '+JSON.stringify({
    nativeValue:original.value,emittedValue:actual.value,
    nativeSource:original.source,emittedSource:actual.source,
    protectedProperties:emitted.metrics.properties
  })+'\n');
  assert.equal(original.value,104);
  assert.equal(actual.value,original.value);
  assert.match(original.source,/observedOwner\.observedSecret/);
  assert.equal(actual.source,original.source,
    'Captured owner source in a host-observed callable must retain original spelling');
  assert.equal(emitted.metrics.properties,1,
    'The unrelated private record must still be obfuscated once');
});


for(const [shape,source] of [
  ['immutable alias of external callback',
    'const saved=hostCallback;'+
    'const owner={privateSecret:31};'+
    'function readPrivate(){saved();return owner.privateSecret;}'+
    'module.exports=readPrivate();'],
  ['globalThis member call to external callback',
    'const owner={privateSecret:31};'+
    'function readPrivate(){globalThis.hostCallback();return owner.privateSecret;}'+
    'module.exports=readPrivate();'],
  ['transitive local helper calls external callback',
    'const owner={privateSecret:31};'+
    'function deliver(){hostCallback();}'+
    'function readPrivate(){deliver();return owner.privateSecret;}'+
    'module.exports=readPrivate();']
]) for(const mode of /** @type {const} */(['coo','sno','sco'])) {
  test(mode+' held-out external callback stack exposure: '+shape,()=>{
    const native=execute(source);
    const output=compile(source,mode);
    const actual=execute(/** @type {string} */(output.code));
    process.stdout.write('CALLSITE_HELDOUT '+JSON.stringify({
      mode,shape,properties:output.metrics.properties,
      nativeValue:native.value,emittedValue:actual.value,
      nativeSource:native.source,emittedSource:actual.source
    })+'\n');
    assert.equal(native.value,31);
    assert.equal(actual.value,native.value);
    assert.match(native.source,/owner\.privateSecret/);
    assert.equal(actual.source,native.source,
      'Runtime stack inspection must preserve the caller function source');
  });
}


for(const mode of /** @type {const} */(['coo','sno','sco'])) {
  test(mode+' implicit host getter executes callback without explicit call syntax',()=>{
    const source='const owner={privateSecret:31};'+
      'function readPrivate(){void externalObserver.trigger;return owner.privateSecret;}'+
      'module.exports=readPrivate();';
    const native=execute(source);
    const output=compile(source,mode);
    const actual=execute(/** @type {string} */(output.code));
    process.stdout.write('CALLSITE_IMPLICIT_GETTER '+JSON.stringify({
      mode,properties:output.metrics.properties,native,emitted:actual
    })+'\n');
    assert.equal(native.value,31);
    assert.equal(actual.value,native.value);
    assert.match(native.source,/owner\.privateSecret/);
    assert.equal(actual.source,native.source,
      'An externally provided getter can synchronously observe caller source');
  });
}


for(const mode of /** @type {const} */(['coo','sno','sco'])) {
  test(mode+' ambient free-identifier getter can inspect caller without call or member syntax',()=>{
    const source='const owner={privateSecret:31};'+
      'function readPrivate(){void ambientValue;return owner.privateSecret;}'+
      'module.exports=readPrivate();';
    const native=execute(source);
    const output=compile(source,mode);
    const actual=execute(/** @type {string} */(output.code));
    process.stdout.write('CALLSITE_AMBIENT_IDENTIFIER '+JSON.stringify({
      mode,properties:output.metrics.properties,native,emitted:actual
    })+'\n');
    assert.equal(native.value,31);
    assert.equal(actual.value,native.value);
    assert.match(native.source,/owner\.privateSecret/);
    assert.equal(actual.source,native.source,
      'An externally supplied global accessor can observe caller source');
  });
}


/**
 * Deprecated legacy caller inspection is independent of V8's structured
 * stack-trace API. It remains observable for sloppy plain functions in Node.
 * @param {string} code
 * @returns {{value:number,source:string}}
 */
function executeWithLegacyCaller(code) {
  const observed={source:''};
  const module={exports:0};
  const hostCallback=/** @type {() => void} */(vm.runInNewContext(
    '(function hostCallback(){observed.source=String(hostCallback.caller);})',
    {observed}
  ));
  vm.runInNewContext(code,{module,hostCallback},{timeout:3000});
  return {value:module.exports,source:observed.source};
}

for(const mode of /** @type {const} */(['coo','sno','sco'])) {
  test(mode+' legacy sloppy Function.caller host source observation',()=>{
    const native=executeWithLegacyCaller(observableSource);
    const output=compile(observableSource,mode);
    const actual=executeWithLegacyCaller(/** @type {string} */(output.code));
    process.stdout.write('CALLSITE_LEGACY_CALLER '+JSON.stringify({
      mode,properties:output.metrics.properties,native,emitted:actual
    })+'\n');
    assert.equal(native.value,31);
    assert.equal(actual.value,native.value);
    assert.match(native.source,/owner\.privateSecret/);
    assert.equal(actual.source,native.source,
      'Sloppy legacy caller inspection must preserve observable function source');
  });
}
