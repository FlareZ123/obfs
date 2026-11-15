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
    'const Native=Reflect.get(globalThis,"String");Native.fromCharCode=()=>"?";'],
  ['direct String prototype alias',
    'const NativePrototype=String.prototype;NativePrototype.charCodeAt=()=>0;'],
  ['transitive String prototype alias',
    'const Ctor=globalThis.String;const P=Ctor.prototype;const Alias=P;Alias.charCodeAt=()=>0;'],
  ['destructured String prototype alias',
    'const {prototype:P}=String;P.charCodeAt=()=>0;'],
  ['Object.getPrototypeOf string alias',
    'const P=Object.getPrototypeOf("");P.charCodeAt=()=>0;'],
  ['string literal __proto__ alias',
    'const P="".__proto__;P.charCodeAt=()=>0;'],
  ['string literal constructor alias',
    'const Native="".constructor;Native.fromCharCode=()=>"?";'],
  ['string literal constructor prototype alias',
    'const P="".constructor.prototype;P.charCodeAt=()=>0;'],
  ['new String getPrototypeOf alias',
    'const P=Object.getPrototypeOf(new String("x"));P.charCodeAt=()=>0;'],
  ['direct eval',
    'eval(`String.fromCharCode=()=>"?";`);'],
  ['indirect eval alias',
    'const compile=eval;compile(`String.fromCharCode=()=>"?";`);'],
  ['Function constructor',
    'new Function(`String.fromCharCode=()=>"?";`)();'],
  ['global Function constructor',
    'globalThis["Function"](`String.fromCharCode=()=>"?";`)();']
];

for(const [title,side] of cases) {
  test('SNO/COO decoder declines earlier intrinsic mutation: '+title,async()=>{
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


test('read-only String prototype alias keeps encoding enabled',()=>{
  /** @type {CommonJsFile[]} */
  const input=[
    {path:'side.cjs',sourceType:'commonjs',
      code:'const Native=String;const P=Native.prototype;const f=P.charCodeAt;'},
    {path:'target.cjs',sourceType:'commonjs',
      code:"module.exports='protected-literal-value';"}
  ];
  const result=obfuscateFiles(input,{
    mode:'sno',strings:true,properties:false,identifiers:false,
    seed:'ambient-string-alias/read-only-prototype'
  });
  assert.ok(result.files.find(file=>file.path==='target.cjs')?.metrics.literals);
});

test('unrelated Number prototype mutation keeps String decoder enabled',()=>{
  /** @type {CommonJsFile[]} */
  const input=[
    {path:'side.cjs',sourceType:'commonjs',
      code:'const P=Object.getPrototypeOf(7);P.toString=function(){return "number";};'},
    {path:'target.cjs',sourceType:'commonjs',
      code:"module.exports='protected-literal-value';"}
  ];
  const result=obfuscateFiles(input,{
    mode:'sno',strings:true,properties:false,identifiers:false,
    seed:'ambient-string-alias/unrelated-number-prototype'
  });
  assert.ok(result.files.find(file=>file.path==='target.cjs')?.metrics.literals);
});


for(const [title,side] of [
  ['direct Array iterator replacement',
    'Array.prototype[Symbol.iterator]=function*(){yield 0;};'],
  ['aliased Array iterator replacement',
    'const Native=Array;const P=Native.prototype;P[Symbol.iterator]=function*(){yield 0;};'],
  ['getPrototypeOf Array iterator replacement',
    'const P=Object.getPrototypeOf([]);P[Symbol.iterator]=function*(){yield 0;};'],
  ['array literal __proto__ iterator replacement',
    'const P=[].__proto__;P[Symbol.iterator]=function*(){yield 0;};'],
  ['array literal constructor iterator replacement',
    'const P=[].constructor.prototype;P[Symbol.iterator]=function*(){yield 0;};'],
  ['new Array getPrototypeOf iterator replacement',
    'const P=Object.getPrototypeOf(new Array(2));P[Symbol.iterator]=function*(){yield 0;};']
]) {
  test('chunked string decoder declines earlier '+title,async()=>{
    const literal='z'.repeat(2048);
    /** @type {CommonJsFile[]} */
    const input=[
      {path:'entry.cjs',sourceType:'commonjs',code:
        "require('./side.cjs');process.stdout.write(require('./target.cjs'));"},
      {path:'side.cjs',sourceType:'commonjs',code:side},
      {path:'target.cjs',sourceType:'commonjs',code:
        'module.exports='+JSON.stringify(literal)+';'}
    ];
    const expected=await execute(input);
    assert.equal(expected.status,0,expected.stderr);
    assert.equal(expected.stdout,literal);
    for(const mode of /** @type {const} */ (['sno','coo'])) {
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'ambient-array-iterator/'+title
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
      const observed=await execute(output.files);
      assert.equal(observed.status,0,observed.stderr);
      assert.equal(observed.stdout,expected.stdout);
    }
  });
}
