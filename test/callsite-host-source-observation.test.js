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
  vm.runInNewContext(code,{module,hostCallback:createHostCallback(observed)},{timeout:3000});
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
  test(mode+' host-supplied CallSite.getFunction exposes direct-only caller source',()=>{
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
    assert.ok(output.metrics.properties>=1,
      'Prove nonzero changed private work rather than an all-zero refusal');
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


test('actual SNO CommonJS launcher preserves numeric behavior but exposes rewritten caller source',()=>{
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
    assert.ok(emitted.metrics.properties>=1);
    assert.match(before.source,/owner\.privateSecret/);
    assert.equal(after.source,before.source,
      'The verified SNO launch path should preserve externally observed function source');
  } finally {
    if(oldHost)Object.defineProperty(globalThis,'hostCallback',oldHost);
    else Reflect.deleteProperty(globalThis,'hostCallback');
    fs.rmSync(root,{recursive:true,force:true});
  }
});
