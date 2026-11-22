'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {atomicWrite}=require('../src/atomic');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} code
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(code){
  return obfuscateFiles([{path:'target.cjs',sourceType:'commonjs',code}],{
    mode:'sno',seed:'real-require-external-sloppy-caller',
    identifiers:true,strings:false,properties:false
  }).files[0];
}

test('real Node require preserves external caller source observation',async()=>{
  const original=[
    'function worker(){const localSecret=17;',
    'return [external(),localSecret];}',
    'module.exports=worker();'
  ].join('\n');
  const transformed=compile(original);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-caller-cjs-'));
  try {
    await atomicWrite(path.join(dir,'native.cjs'),original);
    await atomicWrite(path.join(dir,'compiled.cjs'),transformed.code);
    await atomicWrite(path.join(dir,'host.cjs'),[
      'globalThis.external=function external(){',
      'return String(external.caller).includes("localSecret");};',
      'process.stdout.write(JSON.stringify(require("./"+process.argv[2])));'
    ].join('\n'));

    /**
     * @param {'native.cjs'|'compiled.cjs'} name
     * @returns {string}
     */
    function run(name){
      const child=spawnSync(process.execPath,[path.join(dir,'host.cjs'),name],{
        encoding:'utf8',timeout:12000,windowsHide:true
      });
      assert.ifError(child.error);
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    }
    const native=run('native.cjs');
    const emitted=run('compiled.cjs');
    assert.equal(native,'[true,17]');
    assert.equal(emitted,native,transformed.code);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('real Node private direct-call helper remains eligible for renaming',()=>{
  const original='function worker(){const localSecret=17;return localSecret;}module.exports=worker();';
  const emitted=compile(original);
  assert.ok(emitted.metrics.bindings>0,emitted.code);
});
