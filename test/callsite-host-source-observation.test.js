'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * A Node host callback can inspect an otherwise unexported direct-call-only
 * caller via structured CallSite frames. The callback is deliberately supplied
 * by the execution host and is absent from the compiled source graph.
 * @param {string} code
 * @returns {{value:number,source:string}}
 */
function execute(code) {
  const observed={source:''};
  const module={exports:0};
  // A sloppy external host function is required: V8 deliberately masks
  // CallSite.getFunction() for strict-mode callers. The compiled CommonJS
  // fixture below is also sloppy; the test module itself is strict.
  const hostCallback=/** @type {() => void} */(vm.runInNewContext(
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
  vm.runInNewContext(code,{module,hostCallback},{timeout:3000});
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
}
