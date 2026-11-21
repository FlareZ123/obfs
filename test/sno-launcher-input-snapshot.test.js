'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createSnoLauncher}=require('../src');

/** @param {string|Buffer} value @returns {string} */
function digest(value){
  return createHash('sha256').update(value).digest('hex');
}

test('SNO launcher snapshots package scope bytes before deciding CommonJS entry',()=>{
  const initial='{"type":"commonjs"}';
  let reads=0;
  const files=[
    {
      path:'package.json',
      get code(){
        reads++;
        return reads===1?initial:'{"type":"module"}';
      }
    },
    {path:'entry.js',code:'module.exports=21;'}
  ];
  const output=createSnoLauncher(files,'entry.js');
  assert.equal(reads,1);
  assert.match(output,new RegExp(digest(initial)));
  assert.doesNotMatch(output,new RegExp(digest('{"type":"module"}')));
});

test('SNO launcher samples each source path and code getter once',()=>{
  let pathReads=0;
  let codeReads=0;
  const files=[{
    get path(){
      pathReads++;
      return pathReads===1?'entry.cjs':'unexpected.cjs';
    },
    get code(){
      codeReads++;
      return codeReads===1?'module.exports=7;':'module.exports=99;';
    }
  }];
  const generated=createSnoLauncher(files,'entry.cjs');
  assert.equal(pathReads,1);
  assert.equal(codeReads,1);
  assert.match(generated,new RegExp(digest('module.exports=7;')));
  assert.doesNotMatch(generated,new RegExp(digest('module.exports=99;')));
});

test('SNO direct manifest uses indexed entries even if Array methods are replaced',()=>{
  const files=[{path:'entry.cjs',code:'module.exports=3;'}];
  files.some=()=>false;
  files.find=()=>undefined;
  files.map=()=>[];
  const generated=createSnoLauncher(files,'entry.cjs');
  assert.match(generated,/const checks=\[\[/);
  assert.match(generated,new RegExp(digest('module.exports=3;')));
});

test('SNO snapshot copies caller owned Buffer before a later getter mutates it',()=>{
  const original=Buffer.from('{"type":"commonjs"}');
  const before=digest(original);
  const files=[
    {path:'package.json',code:original},
    {path:'entry.js',get code(){
      original.fill(0x20);
      return 'module.exports=16;';
    }}
  ];
  const generated=createSnoLauncher(files,'entry.js');
  assert.equal(original.toString('utf8').trim(),'');
  assert.match(generated,new RegExp(before));
  assert.doesNotMatch(generated,new RegExp(digest(original)));
});

test('SNO snapshot rejects missing indexed records and invalid code types',()=>{
  const missing=new Array(1);
  assert.throws(()=>createSnoLauncher(missing,'entry.cjs'),
    /SNO files must contain indexed file records/);
  assert.throws(()=>createSnoLauncher([{path:'entry.cjs',code:null}],'entry.cjs'),
    /entry.cjs content must be a string or Buffer/);
});
