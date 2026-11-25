'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');
const exec=promisify(execFile);

const source='const owner={longPrivatePropertyName:7};class Reader{read(){return owner.longPrivatePropertyName;}}const reader=new Reader();const value=reader.read();Array.isArray([]);export {value};';

/**
 * @param {string} sourceText
 * @param {string} generatedCode
 * @param {string} suffix
 * @returns {Promise<{values:number[],frames:string[]}>}
 */
async function runProbe(sourceText,generatedCode,suffix) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent10-esm-frame-'));
  const preloadPath=path.join(directory,'preload-'+suffix+'.cjs');
  const nativePath=path.join(directory,'native-'+suffix+'.mjs');
  const generatedPath=path.join(directory,'generated-'+suffix+'.mjs');
  const runnerPath=path.join(directory,'runner-'+suffix+'.mjs');
  const preload=[
    'const native=Array.isArray;',
    'globalThis.__frames=[];',
    'Array.isArray=function(value){',
    '  const stack=new Error("frame probe").stack||"";',
    '  if(stack.includes("native-'+suffix+'.mjs")||stack.includes("generated-'+suffix+'.mjs"))globalThis.__frames.push(stack);',
    '  return native(value);',
    '};'
  ].join('\n');
  const runner=[
    'const native=await import("./native-'+suffix+'.mjs");',
    'const generated=await import("./generated-'+suffix+'.mjs");',
    'process.stdout.write(JSON.stringify({values:[native.value,generated.value],frames:globalThis.__frames}));'
  ].join('\n');
  fs.writeFileSync(preloadPath,preload);
  fs.writeFileSync(nativePath,sourceText);
  fs.writeFileSync(generatedPath,generatedCode);
  fs.writeFileSync(runnerPath,runner);
  try {
    const {stdout}=await exec(process.execPath,['-r',preloadPath,runnerPath],{
      timeout:15000,encoding:'utf8',maxBuffer:4*1024*1024
    });
    return /** @type {{values:number[],frames:string[]}} */ (JSON.parse(stdout));
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
}

/**
 * @param {string} stack
 * @param {string} filename
 * @returns {{line:number,column:number,frame:string}}
 */
function parseFrame(stack,filename) {
  const frame=stack.split('\n').find(line=>line.includes(filename))??'';
  assert.ok(frame,'Missing active module frame '+filename+': '+stack);
  const match=frame.match(/:(\d+):(\d+)\)?$/u);
  assert.ok(match,'Missing source coordinates in '+frame);
  return {line:Number(match[1]),column:Number(match[2]),frame};
}

test('strict ESM module FramePosition survives private-class property rewrite in all modes',async()=>{
  /** @type {('coo'|'sno'|'sco')[]} */
  const modes=['coo','sno','sco'];
  for(const mode of modes) {
    const output=obfuscateFiles([{path:'generated.mjs',sourceType:'module',code:source}],{
      mode,closedWorld:true,seed:'agent10-esm-module-frame-'+mode,
      identifiers:false,strings:false,properties:true
    }).files[0];
    assert.equal(output.metrics.properties,1,mode+' should retain the proven private-property rewrite');
    const suffix=mode;
    const payload=await runProbe(source,String(output.code),suffix);
    assert.deepEqual(payload.values,[7,7],mode+' must preserve the exported value');
    assert.equal(payload.frames.length,2,mode+' must expose exactly the native and generated module frames');
    const native=parseFrame(payload.frames[0],'native-'+suffix+'.mjs');
    const generated=parseFrame(payload.frames[1],'generated-'+suffix+'.mjs');
    assert.equal(generated.line,native.line,mode+' must preserve the module frame line');
    assert.equal(generated.column,native.column,
      mode+' must preserve the host-observed module frame column; native='+native.frame+', generated='+generated.frame);
  }
});
