'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Execute real Node ESM with built-in node:buffer exports. No source file
 * writes are necessary for the source-parity fixture.
 *
 * @param {string} source
 * @returns {{status:number|null,stdout:string,stderr:string}}
 */
function execute(source) {
  const child=spawnSync(process.execPath,['--input-type=module','--eval',source],{
    encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

const originalFunction="function inspect(){return 'source-byte-ESM-observer-literal';}";

/** @type {readonly [string,string][]} */
const fixtures=[
  ['named import alias',
    "import {btoa as encode} from 'node:buffer';"+originalFunction+
    "console.log(encode(inspect));"],
  ['namespace import',
    "import * as bytes from 'node:buffer';"+originalFunction+
    "console.log(bytes.btoa(inspect));"],
  ['default import',
    "import bytes from 'node:buffer';"+originalFunction+
    "console.log(bytes.btoa(inspect));"],
  ['namespace const alias',
    "import * as bytes from 'node:buffer';const second=bytes;"+originalFunction+
    "console.log(second.btoa(inspect));"]
];

for(const mode of /** @type {const} */(['sno','coo','sco'])) {
  for(const [label,source] of fixtures) {
    test(mode+' native Node buffer ESM btoa source equality: '+label,()=>{
      assert.equal(observesFunctionSource(parse(source,'module')),true,
        'Native buffer imported source observation must be proven');
      const emitted=obfuscateFiles([
        {path:'entry.mjs',sourceType:'module',code:source}
      ],{mode,seed:'node-buffer-btoa-esm/'+mode+'/'+label,
        strings:true,identifiers:false,properties:false}).files[0];
      const native=execute(source);
      const transformed=execute(String(emitted.code));
      assert.equal(native.status,0,native.stderr);
      assert.deepEqual(transformed,native);
      assert.equal(emitted.metrics.literals,0);
    });
  }
}

test('unrelated ESM private literal remains protected in all modes',()=>{
  const source="const value='another-protected-private-esm-literal';"+
    "console.log(value);";
  for(const mode of /** @type {const} */(['sno','coo','sco'])) {
    const emitted=obfuscateFiles([{path:'private.mjs',sourceType:'module',code:source}],
      {mode,seed:'node-buffer-esm-primitive/'+mode,strings:true,
        identifiers:false,properties:false}).files[0];
    assert.deepEqual(execute(String(emitted.code)),execute(source));
    assert.ok(emitted.metrics.literals>0);
  }
});
