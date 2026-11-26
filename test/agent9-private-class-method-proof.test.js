'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {neutralizeHashedNames}=require('../sims/offline-normalize');

/**
 * @param {string} source
 * @param {'coo'|'sno'|'sco'} mode
 */
function compile(source,mode){
  return obfuscateFiles([{path:'private-class.cjs',sourceType:'commonjs',code:source}],{
    mode,seed:'agent9-private-class/'+mode,properties:true,
    identifiers:false,strings:false
  }).files[0];
}

/** @param {string} source @returns {unknown} */
function execute(source) {
  const context={module:{exports:undefined}};
  vm.runInNewContext(source,context,{timeout:2000,filename:'private-class.cjs'});
  return context.module.exports;
}

for(const [name,source,expected,properties] of /** @type {Array<[string,string,number,number]>} */ ([
  ['one direct invocation',
    "'use strict';const owner={privateField:7};"+
    "class Reader{read(){return owner.privateField;}}"+
    "const reader=new Reader();module.exports=reader.read();",7,1],
  ['repeated direct invocation',
    "'use strict';const owner={privateField:7};"+
    "class Reader{read(){return owner.privateField;}}"+
    "const reader=new Reader();module.exports=reader.read()+reader.read();",14,1],
  ['two distinct methods reading two private owner fields',
    "const owner={privateField:7,otherField:11};"+
    "class Reader{read(){return owner.privateField;}other(){return owner.otherField;}}"+
    "const reader=new Reader();module.exports=reader.read()+reader.other();",18,2]
])) {
  for(const mode of /** @type {Array<'coo'|'sno'|'sco'>} */ (['coo','sno','sco'])) {
    test('private direct-call class positive: '+name+' in '+mode,()=>{
      const emitted=compile(source,mode);
      assert.equal(execute(source),expected);
      assert.equal(execute(String(emitted.code)),expected);
      assert.equal(emitted.metrics.objects,1);
      assert.equal(emitted.metrics.properties,properties);
      assert.doesNotMatch(String(emitted.code),/privateField|otherField/u);
      // The public-only static attacker needs no secret seed to relabel the
      // compiler-owned hash. This is positive transform yield, not secrecy.
      const recovered=neutralizeHashedNames([{
        path:'private-class.cjs',sourceType:'commonjs',code:String(emitted.code)
      }]);
      assert.equal(recovered.properties,properties);
      assert.equal(execute(recovered.files[0].code),expected);
    });
  }
}

for(const [name,source] of /** @type {Array<[string,string]>} */ ([
  ['instance escapes',
    "const owner={privateField:7};class Reader{read(){return owner.privateField;}}"+
    "const reader=new Reader();module.exports=reader;"],
  ['method escapes',
    "const owner={privateField:7};class Reader{read(){return owner.privateField;}}"+
    "const reader=new Reader();module.exports=reader.read;"],
  ['class prototype escapes',
    "const owner={privateField:7};class Reader{read(){return owner.privateField;}}"+
    "const reader=new Reader();module.exports=[reader.read(),Reader.prototype];"],
  ['dynamic method access',
    "const owner={privateField:7};class Reader{read(){return owner.privateField;}}"+
    "const reader=new Reader();const key='read';module.exports=reader[key]();"],
  ['source-observed method',
    "const owner={privateField:7};class Reader{read(){return owner.privateField;}}"+
    "const reader=new Reader();module.exports=reader.read.toString();"],
  ['method body escapes callable',
    "const owner={privateField:7};class Reader{read(){globalThis.leaked=this.read;return owner.privateField;}}"+
    "const reader=new Reader();module.exports=reader.read();"],
  ['second method with non-owner return',
    "const owner={privateField:7};class Reader{read(){return owner.privateField;}other(){return 2;}}"+
    "const reader=new Reader();module.exports=reader.read();"],
  ['second method returns instance',
    "const owner={privateField:7};class Reader{read(){return owner.privateField;}other(){return this;}}"+
    "const reader=new Reader();module.exports=reader.read();"],
  ['duplicate method definitions',
    "const owner={privateField:7,otherField:9};"+
    "class Reader{read(){return owner.privateField;}read(){return owner.otherField;}}"+
    "const reader=new Reader();module.exports=reader.read();"],
  ['explicit constructor',
    "const owner={privateField:7};class Reader{constructor(){}read(){return owner.privateField;}}"+
    "const reader=new Reader();module.exports=reader.read();"],
  ['superclass',
    "const owner={privateField:7};class Reader extends Object{read(){return owner.privateField;}}"+
    "const reader=new Reader();module.exports=reader.read();"],
  ['computed method',
    "const owner={privateField:7};class Reader{['read'](){return owner.privateField;}}"+
    "const reader=new Reader();module.exports=reader.read();"],
  ['method with parameter',
    "const owner={privateField:7};class Reader{read(value){return owner.privateField;}}"+
    "const reader=new Reader();module.exports=reader.read();"],
  ['side-effectful argument into method',
    "const owner={privateField:7};class Reader{read(){return owner.privateField;}}"+
    "const reader=new Reader();module.exports=reader.read(globalThis.sideEffect());"],
  ['return expression beyond one member read',
    "const owner={privateField:7};class Reader{read(){return owner.privateField+1;}}"+
    "const reader=new Reader();module.exports=reader.read();"],
  ['instance mutation',
    "const owner={privateField:7};class Reader{read(){return owner.privateField;}}"+
    "const reader=new Reader();reader.read=()=>9;module.exports=reader.read();"]
])) {
  test('class proof refuses unestablished contract: '+name,()=>{
    const emitted=compile(source,'coo');
    assert.equal(emitted.metrics.properties,0,
      name+' must not assume method body or instance remains private');
    assert.equal(emitted.code,source);
  });
}
