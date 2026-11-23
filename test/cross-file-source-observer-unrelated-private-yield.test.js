'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * A source observer in entry.mjs must protect the imported inspect callable
 * in util.mjs. This probe asks whether that effect also freezes an unrelated
 * private object and local binding in unrelated.mjs.
 */
test('source observer in one module does not needlessly freeze a separate private module',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-source-observer-unrelated-'));
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const files=[
    {path:'util.mjs',sourceType:'module',code:[
      'const privateState={secretField:3};',
      'export function inspect(){return privateState.secretField;}'
    ].join('\n')},
    {path:'unrelated.mjs',sourceType:'module',code:[
      'const privateOwner={unrelatedPrivate:7};',
      'function privateReader(){const unrelatedLocal=11;return privateOwner.unrelatedPrivate+unrelatedLocal;}',
      'export const unrelatedValue=privateReader();'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {inspect} from "./util.mjs";',
      'import {unrelatedValue} from "./unrelated.mjs";',
      'console.log(inspect.toString());',
      'console.log(inspect(),unrelatedValue);'
    ].join('\n')}
  ];
  try {
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources) {
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      const child=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{encoding:'utf8'});
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    }
    const expected=await execute(files);
    const output=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'source-observer-unrelated-module-yield',
      properties:true,identifiers:true,strings:false
    });
    const util=output.files.find(file=>file.path==='util.mjs');
    const unrelated=output.files.find(file=>file.path==='unrelated.mjs');
    assert.ok(util);
    assert.ok(unrelated);
    assert.ok(util.code.includes('secretField'),'observed callable property spelling must remain');
    assert.ok(!unrelated.code.includes('unrelatedPrivate'),'unrelated private property should remain eligible');
    assert.ok(!unrelated.code.includes('unrelatedLocal'),'unrelated local binding should remain eligible');
    assert.ok(unrelated.metrics.properties>=1,String(unrelated.code));
    assert.ok(unrelated.metrics.bindings>=1,String(unrelated.code));
    assert.equal(await execute(output.files),expected);
    console.log(JSON.stringify({
      utilMetrics:util.metrics,
      unrelatedMetrics:unrelated.metrics,
      unrelatedPropertyRenamed:true,
      unrelatedBindingRenamed:true,
      runtimeAndObservedSourceParity:true
    }));
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});
