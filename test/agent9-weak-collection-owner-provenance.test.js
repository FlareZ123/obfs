'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Differentially observe object key spellings after graph ownership passes
 * through a weak or proxy container. The object remains strongly referenced
 * by the source scope; no GC/FinalizationRegistry scheduling is assumed.
 *
 * @param {string} source
 * @returns {string|undefined}
 */
function execute(source){
  const realm={module:{exports:undefined}};
  vm.runInNewContext(source,realm,{timeout:2500});
  return JSON.stringify(realm.module.exports);
}

/** @type {Array<[string,string]>} */
const flows=[
  ['WeakRef immediate dereference',
    'const ref=new WeakRef(owner).deref();'],
  ['WeakRef bound constructor',
    'const NativeWeakRef=WeakRef;const ref=new NativeWeakRef(owner).deref();'],
  ['WeakRef returned by helper',
    'function wrap(){return new WeakRef(owner);}const ref=wrap().deref();'],
  ['WeakRef through record member',
    'const box={weak:new WeakRef(owner)};const ref=box.weak.deref();'],
  ['WeakRef prototype-call dereference',
    'const box=new WeakRef(owner);const ref=WeakRef.prototype.deref.call(box);'],
  ['WeakRef Reflect.construct dereference',
    'const ref=Reflect.construct(WeakRef,[owner]).deref();'],
  ['WeakMap initialized from pair array',
    'const map=new WeakMap([[token,owner]]);const ref=map.get(token);'],
  ['WeakMap set and get',
    'const map=new WeakMap();map.set(token,owner);const ref=map.get(token);'],
  ['WeakMap helper returns map',
    'function make(){const map=new WeakMap();map.set(token,owner);return map;}'+
    'const ref=make().get(token);'],
  ['WeakMap through record member',
    'const box={map:new WeakMap([[token,owner]])};const ref=box.map.get(token);'],
  ['Proxy direct target',
    'const ref=new Proxy(owner,{});'],
  ['Proxy.revocable target',
    'const {proxy:ref}=Proxy.revocable(owner,{});'],
  ['Proxy Reflect.construct target',
    'const ref=Reflect.construct(Proxy,[owner,{}]);']
];

/**
 * @param {string} flow
 * @param {number} index
 * @returns {string}
 */
function makeSource(flow,index){
  return 'const owner={secretField:'+(31+index)+',auxiliaryFlag:'+
    (17+index)+'};const token={};'+flow+
    'module.exports=[Object.keys(ref),ref.secretField,owner.auxiliaryFlag];';
}

test('13 weak-reference, weak-map and proxy owner paths preserve reflected keys',{
  timeout:60000
},()=>{
  let pairs=0;
  for(let index=0;index<flows.length;index++){
    const [name,flow]=flows[index];
    for(const mode of /** @type {const} */ (['coo','sno'])){
      for(let seed=0;seed<4;seed++){
        const input=makeSource(flow,index+13*seed);
        const expected=execute(input);
        const output=obfuscateFiles([{
          path:'weak.cjs',sourceType:'commonjs',code:input
        }],{
          mode,seed:'agent9-weak-owner/'+index+'/'+seed,
          properties:true,identifiers:false,strings:false
        }).files[0];
        const actual=execute(String(output.code));
        assert.equal(actual,expected,
          name+'/'+mode+'/'+seed+' changed reflected owner keys; '+
          'native='+expected+' emitted='+actual+' code='+output.code);
        pairs++;
      }
    }
  }
  assert.equal(pairs,104);
});

test('nonreflective private record retains property-rename yield',()=>{
  const input='const owner={secretField:42,auxiliaryFlag:7};'+
    'function read(value){return value.secretField+value.auxiliaryFlag;}'+
    'module.exports=read(owner);';
  for(const mode of /** @type {const} */ (['coo','sno'])){
    const output=obfuscateFiles([{path:'weak.cjs',
      sourceType:'commonjs',code:input}],{
      mode,seed:'agent9-weak-owner-positive',properties:true,
      identifiers:false,strings:false
    }).files[0];
    assert.equal(execute(String(output.code)),execute(input));
    assert.ok(output.metrics.objects>0,
      'unrelated private owner must retain a meaningful property rename');
  }
});
