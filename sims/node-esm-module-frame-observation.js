'use strict';

const assert = require('node:assert/strict');
const {mkdtemp,writeFile,rm} = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

/**
 * Observe a Node ESM module's active top-level frame from an external
 * preloaded host callback. This is an environment probe, not an obfuscator
 * compiler differential.
 * @param {string} key
 * @returns {Promise<{result:number,frame:string,column:number}>}
 */
async function observe(key) {
  const directory = await mkdtemp(path.join(os.tmpdir(),'obfs-esm-frame-'));
  try {
    const preload = path.join(directory,'preload.cjs');
    const runner = path.join(directory,'runner.mjs');
    const target = path.join(directory,'target.mjs');

    await writeFile(preload,
      'const nativeIsArray=Array.isArray;\n' +
      'Array.isArray=function observedIsArray(value){\n' +
      '  if(globalThis.__obfsEsmFrameArmed) globalThis.__obfsEsmFrameStack=new Error().stack;\n' +
      '  return nativeIsArray(value);\n' +
      '};\n','utf8');

    await writeFile(target,
      'const owner={' + key + ':7};' +
      'class Reader{read(){return owner.' + key + ';}}' +
      'const reader=new Reader();' +
      'globalThis.__obfsEsmFrameArmed=true;' +
      'Array.isArray([1,2]);' +
      'globalThis.__obfsEsmFrameArmed=false;' +
      'export const result=reader.read();\n','utf8');

    await writeFile(runner,
      "const {result}=await import('./target.mjs');\n" +
      "const frame=globalThis.__obfsEsmFrameStack.split('\\n').find(line=>line.includes('target.mjs'));\n" +
      "const match=frame?.match(/target\\.mjs:(\\d+):(\\d+)/);\n" +
      "if(!match) throw new Error('target ESM frame missing from stack: '+globalThis.__obfsEsmFrameStack);\n" +
      "process.stdout.write(JSON.stringify({result,frame,column:Number(match[2])}));\n",'utf8');

    const child = spawnSync(process.execPath,['-r',preload,runner],{
      cwd:directory,encoding:'utf8',timeout:10000
    });
    assert.equal(child.error,undefined,child.error?.message);
    assert.equal(child.status,0,child.stderr);
    return /** @type {{result:number,frame:string,column:number}} */ (JSON.parse(child.stdout));
  } finally {
    await rm(directory,{recursive:true,force:true});
  }
}

/** @returns {Promise<void>} */
async function main() {
  const native = await observe('privateField');
  const shortened = await observe('_p');
  assert.equal(native.result,7);
  assert.equal(shortened.result,7);
  assert.notEqual(native.column,shortened.column,
    'a source-length change before the host callback must move the active ESM frame');
  console.log(JSON.stringify({node:process.version,native,shortened},null,2));
}

main().catch(error => {
  console.error(error);
  process.exitCode=1;
});
