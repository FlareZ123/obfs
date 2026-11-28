'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const functionSource='function inspect(){const privateSourceMarker=17;return privateSourceMarker;}\n';
/** @type {{id:string,body:string}[]} */
const fixtures=[
  {id:'named-factory',
    body:'function getTarget(){return document.getElementById("target");}\n'+
      'const target=getTarget();target.setAttribute("data-source",inspect);'},
  {id:'arrow-factory-alias',
    body:'const make=()=>document.body;const alias=make;\n'+
      'const target=alias();target.dataset.probe=inspect;'},
  {id:'nested-return-chain',
    body:'function first(){return document.body;}\n'+
      'function second(){return first();}\n'+
      'const target=second();target.innerText=inspect;'},
  {id:'identity-pass-through',
    body:'const passthrough=(node)=>node;\n'+
      'const target=passthrough(document.body);target.textContent=inspect;'},
  {id:'dom-style-factory',
    body:'const style=()=>document.body.style;\n'+
      'style().setProperty("--source",inspect);'}
];

/** @param {string} code */
function execute(code){
  /** @type {string[]} */
  const source=[];
  /** @param {unknown} value */
  const observe=value=>source.push(String(value));
  const style={setProperty:(_name,value)=>observe(value)};
  const dataset=new Proxy({},{set(_target,_key,value){observe(value);return true;}});
  const body={
    style,dataset,
    setAttribute:(_name,value)=>observe(value),
    set textContent(value){observe(value);},
    set innerText(value){observe(value);}
  };
  const context={document:{body,getElementById:(_id)=>body},
    module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1000});
  return {result:context.module.exports,source};
}

test('function-returned native DOM references retain exact source on WebIDL conversion',()=>{
  /** @type {string[]} */
  const mismatches=[];
  for(const fixture of fixtures){
    const source=functionSource+fixture.body+'\nmodule.exports=inspect();';
    const native=execute(source);
    assert.equal(native.result,17,fixture.id+' native control');
    assert.equal(native.source.length,1,fixture.id+' source captured');
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      const out=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],
        {mode,seed:'agent7-dom-interprocedural-'+fixture.id,
         properties:false,strings:false,identifiers:true});
      const emitted=execute(String(out.files[0].code));
      const parity=native.source[0]===emitted.source[0];
      console.log(JSON.stringify({
        id:fixture.id,mode,observer:observesFunctionSource(parse(source,'commonjs')),
        bindings:out.files[0].metrics.bindings,
        functionalParity:emitted.result===native.result,sourceParity:parity
      }));
      assert.equal(emitted.result,17,fixture.id+' '+mode+' numeric parity');
      if(!parity)mismatches.push(fixture.id+' '+mode);
    }
  }
  assert.deepEqual(mismatches,[],
    'native DOM factory/forwarder calls must not allow source-changing rename');
});

test('proven userland setter receiver remains transform-eligible',()=>{
  const source=functionSource+
    'function getTarget(){return {setAttribute(_a,_b){return 17}};}\n'+
    'const target=getTarget();target.setAttribute("data",inspect);'+
    'module.exports=inspect();';
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const out=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],
      {mode,seed:'agent7-userland-setter-positive',
       properties:false,strings:false,identifiers:true});
    assert.ok(out.files[0].metrics.bindings>0,
      mode+' userland setter independent of native DOMString should transform');
    assert.equal(execute(String(out.files[0].code)).result,17,mode);
  }
});
