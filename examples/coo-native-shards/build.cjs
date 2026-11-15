'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {atomicWrite}=require('../../src/atomic');
const {shardNativeBitvectorModule}=require('../../workplace/coo-native-shards');

/** @returns {Promise<void>} */
async function main() {
  const source=await fs.readFile(path.join(__dirname,'before','main.mjs'),'utf8');
  const generated=shardNativeBitvectorModule(
    {path:'main.mjs',sourceType:'module',code:source},
    {seed:'agent23-native-sample-v1',names:['scramble']});
  assert.equal(generated.functions,1);
  const output=path.join(__dirname,'after');
  const expected=generated.files.map(file=>file.path).sort();
  if(process.argv.includes('--write')) {
    for(const file of generated.files) {
      await atomicWrite(path.join(output,file.path),file.code);
    }
  }
  const actual=(await fs.readdir(output)).filter(name=>name.endsWith('.mjs')).sort();
  assert.deepEqual(actual,expected,'Generated shard set differs');
  for(const file of generated.files) {
    assert.equal(await fs.readFile(path.join(output,file.path),'utf8'),file.code,
      'Generated contents differ: '+file.path);
  }
  console.log('Verified '+generated.files.length+' checked-in native ESM shard outputs');
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
