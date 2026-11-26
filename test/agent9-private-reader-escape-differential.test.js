'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} code @returns {{source:string,result:string,keys:string,exportKeys:string,readerSource:string,hostKeys:string,globalKeys:string}} */
function observe(code){
  const context={module:{exports:/** @type {unknown} */(null)}};
  vm.runInNewContext(code,context,{timeout:1000,filename:'reader-escape.cjs'});
  const exported=context.module.exports;
  const fn=typeof exported==='function'?/** @type {(x:number)=>unknown} */(exported):null;
  const result=fn?fn(7):exported;
  const record=/** @type {Record<string,unknown>|null} */(
    exported!==null&&(typeof exported==='object'||typeof exported==='function')?
      exported:null);
  const reader=record?.reader;
  const leaked=/** @type {Record<string,unknown>} */(context).captured;
  return {
    source:fn?Function.prototype.toString.call(fn):'not-a-function',
    result:JSON.stringify(result)??String(result),
    keys:JSON.stringify(result!==null&&typeof result==='object'?Object.keys(result):[]),
    exportKeys:JSON.stringify(exported!==null&&
      (typeof exported==='object'||typeof exported==='function')?
      Reflect.ownKeys(exported).map(String).sort():[]),
    readerSource:typeof reader==='function'?
      Function.prototype.toString.call(reader):'no-exported-reader',
    hostKeys:JSON.stringify(record?.host!==null&&typeof record?.host==='object'?
      Object.keys(record.host):[]),
    globalKeys:JSON.stringify(leaked&&typeof leaked==='object'?Object.keys(leaked):[])
  };
}

const base='const owner={secretAlpha:23,secretBeta:7};';

/** @type {Array<[string,string]>} */
const fixtures=[
  ['direct private function reader in public wrapper',
    base+'function read(p){return p.secretAlpha;}'+
    'module.exports=function calculate(x){return read(owner)+x;}'],
  ['local alias passed into a private reader from public wrapper',
    base+'const alias=owner;function read(p){return p.secretAlpha;}'+
    'module.exports=function calculate(x){return read(alias)+x;}'],
  ['two declared readers from public wrapper',
    base+'function first(p){return p.secretAlpha;}function second(p){return p.secretBeta;}'+
    'module.exports=function calculate(x){return x*first(owner)+second(owner);}'],
  ['public wrapper also spells direct owner member',
    base+'function read(p){return p.secretAlpha;}'+
    'module.exports=function calculate(x){return read(owner)+owner.secretBeta+x;}'],
  ['public wrapper directly returns owner through identity reader',
    base+'function read(p){return p;}'+
    'module.exports=function calculate(){return read(owner);}'],
  ['public wrapper directly returns owner',
    base+'function read(p){return p.secretAlpha;}'+
    'module.exports=function calculate(){return owner;}'],
  ['private helper returns owner inside array',
    base+'function read(p){return [p];}'+
    'module.exports=function calculate(){return read(owner);}'],
  ['private helper returns owner inside literal record',
    base+'function read(p){return {wrapped:p};}'+
    'module.exports=function calculate(){return read(owner);}'],
  ['private helper returns shallow cloned keys',
    base+'function read(p){return {...p};}'+
    'module.exports=function calculate(){return read(owner);}'],
  ['private helper returns Object.keys',
    base+'function read(p){return Object.keys(p);}'+
    'module.exports=function calculate(){return read(owner);}'],
  ['private helper performs own-key reflective get',
    base+'function read(p){return Reflect.ownKeys(p);}'+
    'module.exports=function calculate(){return read(owner);}'],
  ['reader is itself publicly exported',
    base+'function read(p){return p.secretAlpha;}'+
    'module.exports={reader:read,calculate:function calculate(x){return read(owner)+x;}}'],
  ['owner leaks to host global inside helper',
    base+'function read(p){globalThis.captured=p;return p.secretAlpha;}'+
    'module.exports=function calculate(x){return read(owner)+x;}'],
  ['owner leaks to host global inside wrapper',
    base+'function read(p){return p.secretAlpha;}'+
    'module.exports=function calculate(x){globalThis.captured=owner;return read(owner)+x;}'],
  ['private reader called via Function.prototype.call',
    base+'function read(p){return p.secretAlpha;}'+
    'module.exports=function calculate(x){return read.call(null,owner)+x;}'],
  ['private reader called via Reflect.apply',
    base+'function read(p){return p.secretAlpha;}'+
    'module.exports=function calculate(x){return Reflect.apply(read,null,[owner])+x;}'],
  ['private reader bound to owner as argument',
    base+'function read(p){return p.secretAlpha;}'+
    'module.exports=function calculate(x){return read.bind(null,owner)()+x;}'],
  ['public wrapper receives private reader as callback',
    base+'function read(p){return p.secretAlpha;}'+
    'module.exports=function calculate(x){return [owner].map(read)[0]+x;}'],
  ['private helper dynamic bracket access of owner',
    base+'function read(p){return p["secretAlpha"];}'+
    'module.exports=function calculate(x){return read(owner)+x;}'],
  ['private helper mutates owned fields',
    base+'function read(p){p.secretAlpha+=1;return p.secretAlpha;}'+
    'module.exports=function calculate(x){return read(owner)+x;}'],
  ['public wrapper passes a second argument',
    base+'function read(p){return p.secretAlpha;}'+
    'module.exports=function calculate(x){return read(owner,x)+x;}'],
  ['owner forwarded to a separate host record through helper',
    base+'function read(p){module.exports.host=p;return p.secretAlpha;}'+
    'module.exports=function calculate(x){return read(owner)+x;}']
];
for(const [label,source] of fixtures) {
  test('private-reader escape differential: '+label,()=>{
    for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
      const result=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:source
      }],{mode,seed:'agent9-escape/'+mode+'/'+label,
        strings:false,identifiers:false,properties:true}).files[0];
      const native=observe(source);
      const compiled=observe(String(result.code));
      assert.deepEqual(compiled,native,
        mode+': mismatch under public source or returned object/host observation');
    }
  });
}
