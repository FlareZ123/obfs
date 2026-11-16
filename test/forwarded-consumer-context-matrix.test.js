'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} source @returns {string} */
function result(source) {
  const module={exports:null};
  vm.runInNewContext(source,{module},{timeout:1000});
  return JSON.stringify(module.exports);
}

/** @typedef {'sno'|'coo'} Mode */
/**
 * @param {string} code
 * @param {Mode} mode
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function transform(code,mode) {
  return obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code}],{
    mode,seed:'forwarded-context-matrix',strings:false,identifiers:false
  }).files[0];
}

const wrappers=[
  {name:'function identity',decl:'function pass(x){return x;}',access:'pass(root).secretField'},
  {name:'const identity',decl:'const pass=x=>x;',access:'pass(root).secretField'},
  {name:'function getter',decl:'function getter(){return root;}',access:'getter().secretField'},
  {name:'const getter',decl:'const getter=()=>root;',access:'getter().secretField'},
  {name:'nested identity',decl:'function pass(x){return x;}',access:'pass(pass(root)).secretField'}
];

const riskyConsumers=[
  {name:'invalid call',code:'let output;try{ACCESS();}catch(error){output=error.message;}module.exports=output;'},
  {name:'invalid constructor',code:'let output;try{new (ACCESS)();}catch(error){output=error.message;}module.exports=output;'},
  {name:'invalid template tag',code:'let output;try{ACCESS`text`;}catch(error){output=error.message;}module.exports=output;'},
  {name:'for-of iterable',code:'let output;try{for(const v of ACCESS){}}catch(error){output=error.message;}module.exports=output;'},
  {name:'spread iterable',code:'let output;try{[...ACCESS];}catch(error){output=error.message;}module.exports=output;'},
  {name:'array destructuring initializer',code:'let output;try{const [v]=ACCESS;}catch(error){output=error.message;}module.exports=output;'},
  {name:'yield delegation',code:'function* runner(){yield* ACCESS;}let output;try{runner().next();}catch(error){output=error.message;}module.exports=output;'},
  {name:'reflective function assignment',code:'ACCESS=function(){return Object.keys(this)[0];};module.exports=ACCESS();'},
  {name:'delete exposes inherited original key',code:'Object.prototype.secretField=88;delete ACCESS;module.exports=ACCESS;'},
  {name:'opaque logical member assignment',code:'ACCESS ||= function(){return Object.keys(this)[0];};module.exports=ACCESS;'}
];

/** @param {string} declaration @param {string} body @returns {string} */
function source(declaration,body) {
  return 'const root={secretField:13};'+declaration+body;
}

test('forwarded member consumer-context matrix conservatively rejects unsafe rewrites',()=>{
  let scenarios=0;
  for(const mode of /** @type {Mode[]} */ (['sno','coo'])) {
    for(const wrapper of wrappers) {
      for(const risk of riskyConsumers) {
        const original=source(wrapper.decl,risk.code.replaceAll('ACCESS',wrapper.access));
        const emitted=transform(original,mode);
        const label=[mode,wrapper.name,risk.name].join('/');
        assert.equal(result(emitted.code),result(original),label+': '+emitted.code);
        assert.equal(emitted.metrics.properties,0,label+': '+emitted.code);
        scenarios++;
      }
    }
  }
  assert.equal(scenarios,100);
});

test('same forwarding grammar retains positive scalar own-key transformations',()=>{
  let renamed=0;
  for(const mode of /** @type {Mode[]} */ (['sno','coo'])) {
    for(const wrapper of wrappers) {
      const original=source(wrapper.decl,'module.exports='+wrapper.access+'+4;');
      const emitted=transform(original,mode);
      assert.equal(result(emitted.code),result(original),mode+'/'+wrapper.name);
      if(emitted.metrics.properties===1)renamed++;
    }
  }
  // The direct identity variants must keep the proven positive path.
  assert.ok(renamed>=4,'Unexpected loss of all known-safe forwarded reads');
});
