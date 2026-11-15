'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'commonjs',code:string}} CommonJsFile */

/**
 * Run a CJS dependency graph in a separate Node process so global intrinsic
 * mutations never contaminate unrelated tests.
 * @param {CommonJsFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-string-alias-'));
  try {
    for(const file of files) await atomicWrite(path.join(directory,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(directory,'entry.cjs')],{
      encoding:'utf8',timeout:10000
    });
    if(result.error)throw result.error;
    return {status:result.status,stdout:result.stdout,stderr:result.stderr};
  }finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

const cases=[
  ['String constructor alias',
    'const Native=String;Native.fromCharCode=()=>"?";'],
  ['globalThis alias',
    'const Root=globalThis;Root.String=undefined;'],
  ['transitive global and String aliases',
    'const Root=globalThis;const Native=Root.String;Native.fromCharCode=()=>"?";'],
  ['destructured String alias',
    'const {String:Native}=globalThis;Native.fromCharCode=()=>"?";'],
  ['Reflect.get String alias',
    'const Native=Reflect.get(globalThis,"String");Native.fromCharCode=()=>"?";']
];

for(const [title,side] of cases) {
  test('SNO/COO decoder declines earlier intrinsic alias mutation: '+title,async()=>{
    /** @type {CommonJsFile[]} */
    const input=[
      {path:'entry.cjs',sourceType:'commonjs',code:
        "require('./side.cjs');process.stdout.write(require('./target.cjs'));"},
      {path:'side.cjs',sourceType:'commonjs',code:side},
      {path:'target.cjs',sourceType:'commonjs',code:
        "module.exports='protected-literal-value';"}
    ];
    const expected=await execute(input);
    assert.equal(expected.status,0,expected.stderr);
    assert.equal(expected.stdout,'protected-literal-value');
    for(const mode of /** @type {const} */ (['sno','coo'])) {
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'ambient-string-alias/'+title
      });
      const target=output.files.find(file=>file.path==='target.cjs');
      assert.equal(target?.metrics.literals,0,
        mode+' inserted a decoder after a potentially unsafe intrinsic mutation');
      const observed=await execute(output.files);
      assert.equal(observed.status,0,mode+': '+observed.stderr);
      assert.equal(observed.stdout,expected.stdout,
        mode+' changed the behavior of a valid preloaded CJS graph');
    }
  });
}

test('unrelated String.fromCharCode function alias preserves string encoding',()=>{
  /** @type {CommonJsFile[]} */
  const input=[
    {path:'side.cjs',sourceType:'commonjs',code:'const f=String.fromCharCode;'},
    {path:'target.cjs',sourceType:'commonjs',code:
      "module.exports='protected-literal-value';"}
  ];
  const result=obfuscateFiles(input,{
    mode:'sno',strings:true,properties:false,identifiers:false,
    seed:'ambient-string-alias/harmless-function-reference'
  });
  assert.ok(result.files.find(file=>file.path==='target.cjs')?.metrics.literals);
});
