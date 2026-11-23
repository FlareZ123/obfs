'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');

const producer=[
  'const owner={secretAlpha:23,secretBeta:7};',
  'class Reader{read(){return owner.secretAlpha;}}',
  'const reader=new Reader();',
  'globalThis.value=reader.read()+owner.secretBeta;'
].join('\n');

/**
 * Run a declared two-file classic-script group with shared global lexical bindings.
 * The second script executes after the first, just like independently served
 * classic browser scripts. The source inspector may legally see a class method
 * even when the object instance never escapes the first script.
 *
 * @param {string[]} files
 * @returns {string}
 */
function execute(files){
  const context=vm.createContext({});
  for(const source of files)vm.runInContext(source,context,{timeout:2000});
  return JSON.stringify({value:context.value,spelling:context.spelling});
}

/**
 * @param {string} observer
 * @param {number} index
 * @returns {{native:string,emitted:string,properties:number}}
 */
function paired(observer,index){
  const sources=[producer,observer];
  const result=obfuscateFiles(sources.map((code,i)=>({
    path:'classic'+i+'.js',sourceType:/** @type {const} */('script'),code
  })),{mode:'coo',closedWorld:true,seed:'class-source-matrix-'+index,
    properties:true,strings:false,identifiers:false});
  return {
    native:execute(sources),
    emitted:execute(result.files.map(file=>/** @type {string} */(file.code))),
    properties:result.files.reduce((sum,file)=>sum+file.metrics.properties,0)
  };
}

const observations=[
  ['direct method source', 'globalThis.spelling=Reader.prototype.read.toString();'],
  ['String function conversion', 'globalThis.spelling=String(Reader.prototype.read);'],
  ['Array join implicit conversion', 'globalThis.spelling=[Reader.prototype.read].join("");'],
  ['descriptor value source', 'globalThis.spelling=Object.getOwnPropertyDescriptor(Reader.prototype,"read").value.toString();'],
  ['Reflect.get value source', 'globalThis.spelling=Reflect.get(Reader.prototype,"read").toString();'],
  ['lexical function alias', 'const f=Reader.prototype.read;globalThis.spelling=f.toString();'],
  ['Function toString call', 'globalThis.spelling=Function.prototype.toString.call(Reader.prototype.read);'],
  ['Reflect.apply toString', 'globalThis.spelling=Reflect.apply(Function.prototype.toString,Reader.prototype.read,[]);'],
  ['JSON.stringify replacer', 'globalThis.spelling=JSON.stringify({f:Reader.prototype.read},(k,v)=>typeof v==="function"?String(v):v);'],
  ['computed constructor method source', 'globalThis.spelling=Reader["prototype"]["read"]["toString"]();'],
  ['captured class via eval', 'globalThis.spelling=(0,eval)("Reader.prototype.read.toString()");'],
  ['cross-script function wrapper', 'function view(f){return ""+f;}globalThis.spelling=view(Reader.prototype.read);']
];

for(const [name,observer] of observations){
  test('declared cross-script class source observer: '+name,()=>{
    const result=paired(observer,observations.findIndex(x=>x[0]===name));
    assert.equal(result.emitted,result.native,
      'The secondary classic script must see the original method source and result');
    assert.equal(result.properties,0,
      'A declared observer must veto own-key changes in the reachable method');
  });
}

test('unobserved declared classic script retains numeric parity',()=>{
  const pair=paired('globalThis.spelling=String(globalThis.value);',observations.length);
  assert.equal(pair.emitted,pair.native);
  process.stdout.write('CLASS_SOURCE_MATRIX_CONTROL '+JSON.stringify({
    privateKeyRenames:pair.properties,sourceObserverCases:observations.length
  })+'\n');
});
