'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');
const {obfuscateFiles}=require('../src');

/**
 * The top-level instance initializer precedes the class declaration. Native
 * evaluation therefore throws a TDZ ReferenceError before calling the method.
 * The external Node host can still inspect the CommonJS wrapper source from
 * Error.prepareStackTrace, including source text in the later class body.
 */
const source=[
  'const owner={privateField:7};',
  'const reader=new Reader();',
  'class Reader{read(){return owner.privateField;}}',
  'module.exports=reader.read();'
].join('\n');

/**
 * Observe the CommonJS module wrapper through a host-owned stack hook.
 *
 * @param {string} filePath
 * @returns {string}
 */
function observeWrapperSource(filePath) {
  const runner=[
    'const target=process.argv[1];',
    'Error.prepareStackTrace=(_error,sites)=>{',
    '  const frame=sites.find(site=>site.getFileName()===target);',
    '  const fn=frame&&frame.getFunction();',
    "  return fn?fn.toString():'<missing wrapper source>';",
    '};',
    'try { require(target); } catch (error) { process.stdout.write(error.stack); }'
  ].join('\n');
  const child=spawnSync(process.execPath,['-e',runner,filePath],{
    encoding:'utf8',timeout:10000
  });
  assert.equal(child.status,0,
    child.stderr||child.error?.message||'host observer subprocess failed');
  return child.stdout;
}

for(const mode of /** @type {const} */ (['coo','sno'])) {
  test(mode+' refuses class-method renaming when an earlier TDZ error exposes wrapper source',async()=>{
    const result=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'private-class-tdz-source-observer/'+mode,
      properties:true,identifiers:false,strings:false
    });
    const emitted=result.files[0];
    assert.ok(emitted);
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-class-tdz-'));
    try {
      const originalPath=path.join(root,'original.cjs');
      const emittedPath=path.join(root,'emitted.cjs');
      await atomicWrite(originalPath,source);
      await atomicWrite(emittedPath,emitted.code);
      const originalObserved=observeWrapperSource(originalPath);
      const emittedObserved=observeWrapperSource(emittedPath);
      assert.match(originalObserved,/privateField/u,
        'Native host stack should expose the original class-method source');
      assert.match(emittedObserved,/privateField/u,
        'Generated source must preserve the wrapper text observable from the TDZ error');
      assert.equal(emitted.metrics.properties,0,
        'A source-observable class method must not contribute a private-key rewrite');
    } finally {
      await fs.rm(root,{recursive:true,force:true});
    }
  });
}
