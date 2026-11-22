'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');
const {obfuscateFiles}=require('../src');

const target=[
  "'use strict';",
  '/* STRICT-PRIVACY-WITNESS */',
  'const owner={secretField:17};',
  'const unrelated={otherField:3};',
  'const extra=unrelated.otherField;',
  'const yes=Array.isArray([1,2]);',
  'module.exports=owner.secretField+extra+(yes?1:0);'
].join('\n');

const launcher=[
  'const nativeIsArray=Array.isArray;',
  'Array.isArray=function observedIsArray(value){',
  '  const caller=arguments.callee.caller;',
  '  if(caller){',
  '    const source=Function.prototype.toString.call(caller);',
  '    if(source.includes("STRICT-PRIVACY-WITNESS"))globalThis.observedSource=source;',
  '  }',
  '  return nativeIsArray(value);',
  '};',
  'const value=require("./target.cjs");',
  'process.stdout.write(JSON.stringify({value,source:globalThis.observedSource??""}));'
].join('\n');

/**
 * Host uses the real Node CommonJS loader, whose wrapper inherits a top-level
 * strict directive from target code. A legacy sloppy caller observer is blind.
 * @param {string} code
 * @returns {Promise<{value:number,source:string}>}
 */
async function execute(code) {
  const directory=await mkdtemp(path.join(tmpdir(),'obfs-strict-host-caller-'));
  try {
    await Promise.all([
      atomicWrite(path.join(directory,'launcher.cjs'),launcher),
      atomicWrite(path.join(directory,'target.cjs'),code)
    ]);
    const child=spawnSync(process.execPath,[path.join(directory,'launcher.cjs')],{
      cwd:directory,encoding:'utf8',timeout:12000
    });
    assert.ifError(child.error);
    assert.equal(child.status,0,child.stderr);
    return /** @type {{value:number,source:string}} */ (JSON.parse(child.stdout));
  } finally {
    await rm(directory,{force:true,recursive:true});
  }
}

test('strict native CommonJS wrapper hides its caller from sloppy host hook',async()=>{
  const original=await execute(target);
  assert.deepEqual(original,{value:21,source:''});
});

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test(mode+' preserves strict caller-observer behavior with positive private key yield',async()=>{
    const original=await execute(target);
    const output=obfuscateFiles([{path:'target.cjs',sourceType:'commonjs',code:target}],{
      mode,seed:'strict-host-caller-'+mode,
      closedWorld:true,properties:true,strings:false,identifiers:false
    }).files[0];
    assert.ok(output.metrics.properties>=1,
      'A strict target should retain real private-property renaming under this observer');
    const emitted=await execute(String(output.code));
    assert.deepEqual(emitted,original);
    console.log('STRICT_HOST_CALLER '+JSON.stringify({
      mode,propertyYield:output.metrics.properties,original,emitted
    }));
  });
}
