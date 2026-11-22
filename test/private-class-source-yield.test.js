'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const test=require('node:test');
const {obfuscateFiles}=require('../src');

/**
 * Class declaration and all instances are local. Only the computed numeric
 * primitive escapes. No source-observer or opaque callback receives the class.
 * Under a source-sensitive strict export policy this owner should still
 * remain transformable.
 */
const source=[
  "'use strict';",
  'const owner={privateField:7};',
  'class Reader{read(){return owner.privateField;}}',
  'const reader=new Reader();',
  'module.exports=reader.read();'
].join('');

/**
 * @param {string} code
 * @returns {number}
 */
function evaluate(code){
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{filename:'private-class.cjs',timeout:2000});
  return Number(context.module.exports);
}

for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])){
  test(mode+' private direct-use class preserves value and permits private owner rename',()=>{
    const result=obfuscateFiles([{
      path:'private-class.cjs',sourceType:'commonjs',code:source
    }],{mode,seed:'private-class-source-yield/'+mode,
      properties:true,identifiers:false,strings:false});
    const emitted=result.files[0];
    assert.equal(evaluate(source),7);
    assert.equal(evaluate(/** @type {string} */ (emitted.code)),7);
    assert.ok(emitted.metrics.properties>0,
      'A fully private direct-use class should not suppress every owner-key rewrite: '+
      emitted.code);
  });
}


test('class source proof conservatively refuses escaped, mutable and observable method shapes',()=>{
  const owner='const owner={privateField:7};';
  const basic='class Reader{read(){return owner.privateField;}}';
  /** @type {Array<[string,string]>} */
  const rejected=[
    ['exported class',basic+'module.exports=Reader;'],
    ['exported instance',basic+'const reader=new Reader();module.exports=reader;'],
    ['exported method',basic+'const reader=new Reader();module.exports=reader.read;'],
    ['method source observer',basic+
      'const reader=new Reader();module.exports=reader.read.toString();'],
    ['prototype descriptor observation',basic+
      'const reader=new Reader();Object.getOwnPropertyDescriptor(Reader.prototype,"read");'+
      'module.exports=reader.read();'],
    ['two method invocations',basic+
      'const reader=new Reader();module.exports=reader.read()+reader.read();'],
    ['instance alias',basic+'const reader=new Reader();const alias=reader;'+
      'module.exports=alias.read();'],
    ['computed method dispatch',basic+
      'const reader=new Reader();module.exports=reader["read"]();'],
    ['mutable instance',basic+
      'let reader=new Reader();module.exports=reader.read();'],
    ['class constructor arguments',basic+
      'const reader=new Reader(1);module.exports=reader.read();'],
    ['subclass edge','class Reader extends Object{read(){return owner.privateField;}}'+
      'const reader=new Reader();module.exports=reader.read();'],
    ['method with side effect','class Reader{read(){globalThis.sideEffect=1;'+
      'return owner.privateField;}}const reader=new Reader();module.exports=reader.read();'],
    ['method with parameter','class Reader{read(value){return owner.privateField+value;}}'+
      'const reader=new Reader();module.exports=reader.read(1);']
  ];
  for(const [name,tail] of rejected) {
    const source="'use strict';"+owner+tail;
    for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])){
      const result=obfuscateFiles([{
        path:'class-negative.cjs',sourceType:'commonjs',code:source
      }],{mode,seed:'class-source-negative/'+name,
        properties:true,identifiers:false,strings:false});
      assert.equal(result.files[0].metrics.properties,0,
        mode+' '+name+' must retain public/ambiguous method field spelling');
      assert.match(String(result.files[0].code),/privateField/u,name);
    }
  }
});
