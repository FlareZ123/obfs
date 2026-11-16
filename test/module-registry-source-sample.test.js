'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const path=require('node:path');

const root=path.join(__dirname,'..','examples','module-registry-source');

/** @param {string} file @returns {string} */
function run(file){
  const result=spawnSync(process.execPath,[path.join(root,file)],{
    encoding:'utf8',timeout:20000
  });
  if(result.error)throw result.error;
  assert.equal(result.status,0,result.stderr);
  return result.stdout;
}

test('checked-in CommonJS source-registry before/after files match real compiler',()=>{
  const builder=spawnSync(process.execPath,[path.join(root,'build.cjs'),'--check'],{
    encoding:'utf8',timeout:20000
  });
  if(builder.error)throw builder.error;
  assert.equal(builder.status,0,builder.stderr);
  assert.equal(run('before/observed.cjs'),'31 true\n');
  assert.equal(run('after/observed.cjs'),'31 true\n');
  assert.equal(run('before/private.cjs'),'31\n');
  assert.equal(run('after/private.cjs'),'31\n');
});
