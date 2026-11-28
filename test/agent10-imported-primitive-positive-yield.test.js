'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} Input */

/** @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>} */
async function execute(files) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-safe-primitive-positive-'));
  try {
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(dir,'consumer.mjs')],{
      cwd:dir,encoding:'utf8',timeout:15000
    });
    assert.equal(result.status,0,result.stderr||String(result.error));
    return result.stdout;
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}
/** @type {[string,string][]} */
const variants=[
  ['pure-binary','const stable=number+5;'],
  ['pure-branch','const stable=true?number+5:number-5;'],
  ['pure-alias','const local=number;const stable=local+5;'],
  ['array-contained-no-method','const stable=[number+5][0];']
];
for(const [variant,statement] of variants) {
  test('independent protected-owner cross-file positive remains when imported primitive is used inertly '+variant,
    async()=>{
      /** @type {Input[]} */
      const input=[
        {path:'owner.mjs',sourceType:'module',
          code:'export const owner={secretField:7,privateDepth:5};'},
        {path:'primitive.mjs',sourceType:'module',code:'export const number=7;'},
        {path:'consumer.mjs',sourceType:'module',code:[
          'import {owner} from "./owner.mjs";',
          'import {number} from "./primitive.mjs";',
          statement,
          'console.log(JSON.stringify({result:owner.secretField*stable+owner.privateDepth}));'
        ].join('\n')}
      ];
      const native=await execute(input);
      assert.equal(native,'{"result":89}\n');
      for(const mode of /** @type {Array<'coo'|'sco'|'sno'>} */ (['coo','sco','sno'])) {
        const emitted=obfuscateFiles(input,{
          mode,closedWorld:true,identifiers:false,strings:false,properties:true,
          seed:'agent10-imported-safe-positive/'+variant+'/'+mode
        });
        const observed=await execute(emitted.files);
        assert.equal(observed,native,mode+' must preserve exact arithmetic and output');
        assert.ok(emitted.crossFile.properties>=2,
          mode+' must actually rename the independently closed ESM private owner');
        assert.doesNotMatch(String(emitted.files.find(f=>f.path==='owner.mjs')?.code),
          /secretField|privateDepth/u,'owner property definitions must be changed');
      }
    });
}
