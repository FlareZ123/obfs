'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @typedef {{name:string,setup:string,read:string}} ObserverCase */

/** @type {ObserverCase[]} */
const observers=[
  {name:'direct conditional Reflect.get',setup:'const key=true?"toString":"valueOf";',
    read:'Reflect.get(observed,key).call(observed)'},
  {name:'direct conditional descriptor',setup:'const key=true?"toString":"valueOf";',
    read:'Object.getOwnPropertyDescriptor(Function.prototype,key).value.call(observed)'},
  {name:'captured Reflect.get',setup:'const get=Reflect.get;',
    read:'get(observed,"toString").call(observed)'},
  {name:'receiver alias Reflect.get',setup:'const R=Reflect;',
    read:'R.get(observed,"toString").call(observed)'},
  {name:'destructured Reflect.get',setup:'const {get:reader}=Reflect;',
    read:'reader(observed,"toString").call(observed)'},
  {name:'captured descriptor alias chain',
    setup:'const O=Object;const A=O;const reader=A.getOwnPropertyDescriptor;',
    read:'reader(Function.prototype,"toString").value.call(observed)'},
  {name:'computed Function.prototype',setup:'const key=true?"toString":"valueOf";',
    read:'Function.prototype[key].call(observed)'},
  {name:'computed Reflect.getPrototypeOf',setup:'const key=true?"toString":"valueOf";const proto=Reflect.getPrototypeOf(observed);',
    read:'proto[key].call(observed)'},
  {name:'computed Object.getPrototypeOf',setup:'const key=true?"toString":"valueOf";const proto=Object.getPrototypeOf(observed);',
    read:'proto[key].call(observed)'},
  {name:'bulk prototype descriptors',setup:'const key=true?"toString":"valueOf";const descriptors=Object.getOwnPropertyDescriptors(Function.prototype);',
    read:'descriptors[key].value.call(observed)'},
  {name:'destructured Function prototype source method',
    setup:'const {toString:sourceMethod}=Function.prototype;',
    read:'sourceMethod.call(observed)'},
  {name:'destructured prototype alias source method',
    setup:'const prototypeAlias=Function.prototype;const {toString:sourceMethod}=prototypeAlias;',
    read:'sourceMethod.call(observed)'},
  {name:'destructured runtime-key function prototype',
    setup:'const key=true?"toString":"valueOf";const {[key]:sourceMethod}=Function.prototype;',
    read:'sourceMethod.call(observed)'},
  {name:'assigned Reflect.get source reader',
    setup:'let sourceReader;sourceReader=Reflect.get;',
    read:'sourceReader(observed,"toString").call(observed)'},
  {name:'assigned reflective receiver alias',
    setup:'let receiver;receiver=Reflect;',
    read:'receiver.get(observed,"toString").call(observed)'},
  {name:'globalThis reflected source reader',
    setup:'const sourceReader=globalThis.Reflect.get;',
    read:'sourceReader(observed,"toString").call(observed)'},
  {name:'assigned destructuring reflected source reader',
    setup:'let sourceReader;({get:sourceReader}=Reflect);',
    read:'sourceReader(observed,"toString").call(observed)'},
  {name:'aliased Reflect.getPrototypeOf computed source',
    setup:'const R=Reflect;const proto=R.getPrototypeOf(observed);const key=true?"toString":"valueOf";',
    read:'proto[key].call(observed)'},
  {name:'globalThis.Object.getPrototypeOf computed source',
    setup:'const O=globalThis.Object;const proto=O.getPrototypeOf(observed);const key=true?"toString":"valueOf";',
    read:'proto[key].call(observed)'},
  {name:'globalThis.Reflect.getPrototypeOf computed source',
    setup:'const proto=globalThis.Reflect.getPrototypeOf(observed);const key=true?"toString":"valueOf";',
    read:'proto[key].call(observed)'},
  {name:'aliased Object bulk descriptors',
    setup:'const O=Object;const key=true?"toString":"valueOf";const descriptors=O.getOwnPropertyDescriptors(Function.prototype);',
    read:'descriptors[key].value.call(observed)'},
  {name:'captured bulk descriptor reader',
    setup:'const readAll=Object.getOwnPropertyDescriptors;const descriptors=readAll(Function.prototype);',
    read:'descriptors.toString.value.call(observed)'},
  {name:'destructured bulk descriptor reader',
    setup:'const {getOwnPropertyDescriptors:readAll}=Object;const descriptors=readAll(Function.prototype);',
    read:'descriptors.toString.value.call(observed)'},
  {name:'globalThis Object bulk descriptor reader',
    setup:'const readAll=globalThis.Object.getOwnPropertyDescriptors;const descriptors=readAll(Function.prototype);',
    read:'descriptors.toString.value.call(observed)'},
  {name:'spread Reflect.get arguments',
    setup:'const args=[observed,true?"toString":"valueOf"];',
    read:'Reflect.get(...args).call(observed)'},
  {name:'Reflect.get through Function.call',
    setup:'const key=true?"toString":"valueOf";',
    read:'Reflect.get.call(Reflect,observed,key).call(observed)'},
  {name:'Reflect.get through Function.apply',
    setup:'const args=[observed,"toString"];',
    read:'Reflect.get.apply(Reflect,args).call(observed)'},
  {name:'captured Reflect.get through Function.call',
    setup:'const reader=Reflect.get;const key=true?"toString":"valueOf";',
    read:'reader.call(Reflect,observed,key).call(observed)'},
  {name:'bound reflective source reader',
    setup:'const reader=Reflect.get.bind(Reflect,observed,"toString");',
    read:'reader().call(observed)'}
];

/** @param {string} code @returns {{value:string,source:string}} */
function execute(code) {
  /** @type {{out?:{value:string,source:string}}} */
  const sandbox={};
  vm.runInNewContext(code,sandbox,{timeout:2000});
  assert.ok(sandbox.out);
  return sandbox.out;
}

test('finite reflective function-source differential across three deployment modes',()=>{
  const declaration="function observed(){const text='source-observation-literal';return text;}";
  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    for(const observer of observers) {
      const original=declaration+observer.setup+
        'globalThis.out={value:observed(),source:'+observer.read+'};';
      const native=execute(original);
      assert.equal(native.source,declaration,observer.name+' native source');
      for(let i=0;i<3;i++) {
        const result=obfuscateFiles([{path:'entry.js',sourceType:'script',code:original}],{
          mode,seed:'reflect-source-'+mode+'-'+observer.name+'-'+i,strings:true
        });
        const emitted=execute(/** @type {string} */(result.files[0].code));
        assert.deepEqual(JSON.parse(JSON.stringify(emitted)),JSON.parse(JSON.stringify(native)),
          mode+'/'+observer.name+'/'+i);
      }
    }
  }
});

for(const [name,read] of /** @type {[string,string][]} */ ([
  ['direct Reflect.get', "const value=Reflect.get({known:2},'known');"],
  ['captured Reflect.get', "const get=Reflect.get;const value=get({known:2},'known');"],
  ['assigned Reflect.get', "let get;get=Reflect.get;const value=get({known:2},'known');"],
  ['direct descriptor', "const value=Object.getOwnPropertyDescriptor({known:2},'known').value;"]
])) {
  test('known benign reflective key still transforms unrelated text: '+name,()=>{
    const source="const text='source-observation-literal';"+read+
      "globalThis.out={value:text,source:'benign'};globalThis.count=value;";
    const native=execute(source);
    const transformed=obfuscateFiles([{path:'entry.js',sourceType:'script',code:source}],{
      mode:'coo',seed:'benign-reflect-'+name,properties:true,identifiers:true,strings:true
    });
    const output=/** @type {string} */(transformed.files[0].code);
    assert.deepEqual(JSON.parse(JSON.stringify(execute(output))),JSON.parse(JSON.stringify(native)));
    assert.equal(output.includes("'source-observation-literal'"),false,
      'Proved non-source reflection must retain unrelated string transformation');
  });
}
