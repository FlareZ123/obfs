'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {parse,observesFunctionSource}=require('../src/ast');
const {obfuscateFiles}=require('../src');
const {recoverObfuscatedStrings}=require('../sims/static-string-recovery');

/** @param {string} source @returns {string|undefined} */
function execute(source) {
  const context={module:{exports:undefined}};
  vm.runInNewContext(source,context,{timeout:1500});
  return JSON.stringify(context.module.exports);
}

/**
 * @param {number} n
 * @returns {string}
 */
function sample(n) {
  const suffix=JSON.stringify('::tail-'+n);
  const unicode=JSON.stringify('private-unicode-'+n+'-😀-\uD800-\u2028');
  const other=JSON.stringify('private-second-'+n+'-abcdefghijklmnopqrstuvwxyz');
  const items=[unicode,other,'41','null','true','false','123n','-0','7.25',
    '`template-constant-string`'];
  const index=(n*73+17)%items.length;
  return "'use strict';module.exports=["+items.join(',')+"]["+index+"]+"+suffix+';';
}

test('128 deterministic inline primitive-slot programs remain reversible and equivalent',()=>{
  let cases=0;
  let totalReplaced=0;
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    for(let n=0;n<64;n++) {
      const source=sample(n);
      assert.equal(observesFunctionSource(parse(source,'commonjs')),false,
        'False source observer at sample '+n);
      const output=obfuscateFiles([{path:'sample.cjs',sourceType:'commonjs',code:source}],{
        mode,seed:'inline-primitive-fuzz/'+mode+'/'+n,properties:false,
        strings:true,identifiers:false
      }).files[0];
      assert.ok(output.metrics.literals>=2,'Expected two encoded literals at '+n);
      const recovered=recoverObfuscatedStrings(String(output.code),'commonjs');
      assert.equal(recovered.tables,1,'Missing emitted XOR table at '+n);
      assert.ok(recovered.literals>=2,'Missing independent reconstructed strings at '+n);
      const original=execute(source);
      assert.equal(execute(String(output.code)),original,'Obfuscated behavior at '+n);
      assert.equal(execute(recovered.code),original,'Reconstructed behavior at '+n);
      cases++;
      totalReplaced+=recovered.literals;
    }
  }
  assert.equal(cases,128);
  assert.ok(totalReplaced>=256);
});
