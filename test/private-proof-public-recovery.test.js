'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {transformSync}=require('esbuild');
const {obfuscateFiles}=require('../src');
const {normalizePublicIsland}=require('../sims/source-island-public-normalizer');

/** @param {string} source @returns {unknown} */
function execute(source) {
  const scope={module:{exports: /** @type {unknown} */ (null)}};
  vm.runInNewContext(source,scope,{filename:'entry.cjs',timeout:3000});
  return scope.module.exports;
}

const scenarios=[
  {
    label:'single private class method',
    source:[
      'const owner={secretField:41};',
      'class Reader{read(){return owner.secretField;}}',
      'const instance=new Reader();',
      'module.exports=instance.read();'
    ].join(''),
    expectedType:'number'
  },
  {
    label:'private reader behind a published function',
    source:[
      'const owner={secretField:41};',
      'function read(input){return input.secretField;}',
      'function published(n){return read(owner)+n;}',
      'module.exports=published;'
    ].join(''),
    expectedType:'function'
  }
];

/**
 * The attack intentionally imports no compiler parser, AST analysis,
 * original source, or obfuscation seed. It sees delivered bytes only.
 * The ordinary esbuild control independently consumes the original.
 */
for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  for(const {label,source,expectedType} of scenarios) {
    test(mode+' public-source clone versus minifier: '+label,()=>{
      const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
        mode,seed:'independent-public-recovery-'+mode+'-'+label,
        strings:false,identifiers:false,properties:true
      });
      const generated=String(output.files[0].code);
      assert.equal(output.files[0].metrics.properties,1,
        'Require actual own-field rewriting, never an unchanged identity sample');
      assert.doesNotMatch(generated,/secretField/u);
      const recovered=normalizePublicIsland(generated);
      assert.equal(recovered.properties,1,
        'Seedless public byte inspection should recover the field name');
      assert.notEqual(recovered.code,generated);
      const minified=transformSync(source,{
        loader:'js',format:'cjs',target:'node22',minify:true
      }).code;
      const native=execute(source);
      const emitted=execute(generated);
      const recoveredValue=execute(recovered.code);
      const minifiedValue=execute(minified);
      assert.equal(typeof native,expectedType);
      for(const candidate of [emitted,recoveredValue,minifiedValue])
        assert.equal(typeof candidate,expectedType);
      if(typeof native==='function') {
        const expected=/** @type {(n:number)=>number} */ (native);
        for(const candidate of [emitted,recoveredValue,minifiedValue]) {
          const fn=/** @type {(n:number)=>number} */ (candidate);
          for(let n=-256;n<=256;n++)assert.equal(fn(n),expected(n));
        }
        assert.equal(String(emitted),String(native),
          'Published wrapper must preserve exact callable source');
      }else for(const candidate of [emitted,recoveredValue,minifiedValue])
        assert.equal(candidate,native);
      console.log('INDEPENDENT_PUBLIC_PROOF_RECOVERY '+JSON.stringify({
        mode,label,rewrittenFields:output.files[0].metrics.properties,
        publicRecoveryFields:recovered.properties,
        originalBytes:Buffer.byteLength(source),
        ordinaryMinifiedBytes:Buffer.byteLength(minified),
        generatedBytes:Buffer.byteLength(generated),
        recoveredBytes:Buffer.byteLength(recovered.code),
        functionalParity:true
      }));
    });
  }
}
