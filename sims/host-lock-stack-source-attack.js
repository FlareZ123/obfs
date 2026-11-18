'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');

const source=[
  'try { null.value; }',
  'catch (error) { globalThis.result=error.stack; }'
].join('\n');

/**
 * @param {string} code
 * @param {string} hostname
 * @returns {string}
 */
function evaluate(code,hostname='example.com'){
  const context={location:{hostname}};
  vm.runInNewContext(code,context,{filename:'entry.js',timeout:2000});
  return String(context.result);
}

/**
 * @param {boolean} guarded
 * @returns {void}
 */
function run(guarded){
  for(const mode of /** @type {const} */(['coo','sco'])){
    const options={
      mode,seed:'host-lock-stack-'+mode,
      strings:false,properties:false,identifiers:false,
      allowedHosts:['example.com']
    };
    if(guarded){
      assert.throws(
        ()=>obfuscateFiles([{path:'entry.js',sourceType:'script',code:source}],options),
        /Host locking cannot preserve observable source/u,
        mode+': stack-observing host lock must fail closed'
      );
    }else{
      const emitted=obfuscateFiles([
        {path:'entry.js',sourceType:'script',code:source}
      ],options).files[0];
      const native=evaluate(source);
      const transformed=evaluate(/** @type {string} */(emitted.code));
      assert.match(native,/entry\.js:1:12/u);
      assert.match(transformed,/entry\.js:\d+:12/u);
      assert.notEqual(transformed,native,
        mode+': host wrapper must expose the pre-guard source-coordinate mismatch');
      process.stdout.write('HOST_LOCK_STACK_OPERAND '+JSON.stringify({
        mode,nativeFrame:native.split('\n')[1],
        transformedFrame:transformed.split('\n')[1],
        parity:native===transformed
      })+'\n');
    }

    const safe='globalThis.result=41+1;';
    const safeEmitted=obfuscateFiles([
      {path:'safe.js',sourceType:'script',code:safe}
    ],{...options,seed:'host-lock-safe-'+mode}).files[0];
    assert.equal(evaluate(/** @type {string} */(safeEmitted.code)),'42');
    assert.throws(
      ()=>evaluate(/** @type {string} */(safeEmitted.code),'attacker.example'),
      /Unauthorized execution host/u
    );
  }
}

if(require.main===module)run(process.argv.includes('--expect-guarded'));
module.exports={run};
