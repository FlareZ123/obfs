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

const source='const message="This sufficiently long string literal tests whether encoding preserves source positions.";const value=message.length;Array.isArray([]);export {value};';

/**
 * @param {string} sourceText
 * @param {string} generatedCode
 * @param {string} suffix
 * @returns {Promise<{values:number[],frames:string[]}>}
 */
async function runProbe(sourceText,generatedCode,suffix) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent10-string-frame-'));
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

test('strict ESM Node host callback observes stable module FramePosition after string encoding',async()=>{
  const expectedValue=source.match(/message="([^"]+)"/u)?.[1].length;
  /** @type {('coo'|'sno'|'sco')[]} */
  const modes=['coo','sno','sco'];
  for(const mode of modes) {
    const output=obfuscateFiles([{path:'generated.mjs',sourceType:'module',code:source}],{
      mode,closedWorld:true,seed:'agent10-string-node-frame-'+mode,
      identifiers:false,strings:true,properties:false
    }).files[0];
    assert.ok(output.metrics.literals>0,mode+' must transform the long string literal');
    const payload=await runProbe(source,String(output.code),mode);
    assert.deepEqual(payload.values,[expectedValue,expectedValue],mode+' must preserve the exported string length');
    assert.equal(payload.frames.length,2,mode+' must expose exactly native and generated module frames');
    const native=parseFrame(payload.frames[0],'native-'+mode+'.mjs');
    const generated=parseFrame(payload.frames[1],'generated-'+mode+'.mjs');
    assert.equal(generated.line,native.line,mode+' must preserve the module frame line');
    assert.equal(generated.column,native.column,
      mode+' must preserve the module frame column; native='+native.frame+', generated='+generated.frame);
  }
});
