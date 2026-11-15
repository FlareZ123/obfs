'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {transform}=require('../lib/transform');
const {reconstruct}=require('../sims/reconstruct');

test('static script neutralizes all mangled property names and retains runtime behavior',()=>{
  const input={
    'source.mjs':'export const a={secret:10,metadata:"foo"};',
    'main.mjs':'import {a} from "./source.mjs"; console.log(a.secret,a["metadata"]);',
  };
  const obfuscated=transform(input,{closedWorld:true,seed:'attack-demo'});
  const reconstructed=reconstruct(obfuscated.files);
  assert.equal(obfuscated.renamed,2);
  assert.equal(reconstructed.renamed,2);
  assert.ok(Object.values(reconstructed.files).every(x=>!/_\$[a-f0-9]{14}/.test(x)));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-attack-'));
  try{
    const run=files=>{
      for(const [name,code]of Object.entries(files))fs.writeFileSync(path.join(dir,name),code);
      const result=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return result.stdout;
    };
    assert.equal(run(input),run(reconstructed.files));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
