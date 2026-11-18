'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Execute the native or emitted program with an isolated CommonJS export.
 * @param {string} code
 * @returns {string}
 */
function output(code){
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{filename:'private-in-metamorphic.cjs',timeout:3000});
  return JSON.stringify(context.module.exports);
}

/**
 * Preserve output and deliberately assert positive/negative transformation yield.
 * @param {string} code
 * @param {number} expectedProperties
 * @returns {void}
 */
function check(code,expectedProperties){
  const original=output(code);
  for(const mode of /** @type {('coo'|'sno')[]} */ (['coo','sno'])){
    const transformed=obfuscateFiles([{
      path:'private-in-metamorphic.cjs',sourceType:'commonjs',code
    }],{
      mode,seed:'private-in-review-'+mode,strings:false,identifiers:false
    });
    const emitted=/** @type {string} */ (transformed.files[0].code);
    assert.equal(transformed.files[0].metrics.properties,expectedProperties,
      mode+' admission mismatch for '+JSON.stringify(code)+': '+emitted);
    assert.equal(output(emitted),original,
      mode+' output mismatch for '+JSON.stringify(code)+': '+emitted);
  }
}

/** @type {string[]} */
const keys=[
  'plain','x','with-dash','with space','0','01','42','1e3',
  'π','漢字','🔐','a\\b','a"b',"a'b",'line\nbreak','tab\tkey',
  '\\','/','--','..','default','length','toStringX','💡',
  'prototypeX','constructorX','__proto__X','é','e\u0301','\uD800',
  '\uDC00','\u0000'
];

for(const key of keys){
  test('private in same-owned data key parity: '+JSON.stringify(key),()=>{
    const name=JSON.stringify(key);
    const code="'use strict';const bag={"+name+":7};"+
      'const twin={same:11};const alias=bag;'+
      'module.exports=['+name+' in alias,alias['+name+'],'+
      '"same" in twin,twin.same];';
    check(code,2);
  });
}

for(const source of [
  'const bag={secret:3};module.exports=[!("secret" in bag),bag.secret];',
  'const bag={secret:3};module.exports=[("secret" in bag)?bag.secret:0];',
  'const bag={secret:3};let x=0;for(let i=0;i<8;i++){if("secret" in bag)x+=bag.secret;}module.exports=x;',
  'const bag={secret:3};function check(){return "secret" in bag;}module.exports=[check(),bag.secret];',
  'const bag={secret:3};bag.secret++;module.exports=["secret" in bag,bag.secret];',
  'const bag={secret:3};bag.secret*=7;module.exports=["secret" in bag,bag.secret];',
  'const bag={secret:3};let alias=bag;module.exports=["secret" in alias,alias.secret];',
  'const bag={secret:3};const alias=bag;module.exports=["secret" in bag,"secret" in alias,alias.secret];',
  'function check(obj){return "secret" in obj;}const bag={secret:3};module.exports=[check(bag),bag.secret];'
]){
  test('private in positive contextual shape: '+source.slice(0,90),()=>check(source,1));
}

for(const source of [
  'const bag={secret:3};const key="secret";module.exports=[key in bag,bag.secret];',
  'const bag={secret:3};module.exports=["missing" in bag,bag.secret];',
  'const bag={secret:3};module.exports=["toString" in bag,bag.secret];',
  'const bag={secret:3};const f=()=> "secret";module.exports=[f() in bag,bag.secret];',
  'const bag={secret:3};const proxy=new Proxy(bag,{has(){return false;}});module.exports=["secret" in bag,"secret" in proxy];',
  'const bag={secret:3};Reflect.deleteProperty(bag,"secret");module.exports="secret" in bag;',
  'const bag={secret:3};Object.freeze(bag);module.exports="secret" in bag;',
  'const bag={secret:3};const other=Object.assign({},bag);module.exports=["secret" in bag,"secret" in other];',
  'const bag={secret:3};const other={...bag};module.exports=["secret" in bag,"secret" in other];',
  'const bag={secret:3};const source=Object.getOwnPropertyNames(bag);module.exports=["secret" in bag,source];',
  'const bag={secret:3};const o=Object.create(bag);module.exports=["secret" in bag,"secret" in o];',
  'const bag={secret:3};module.exports=["secret" in bag,Object.prototype.hasOwnProperty.call(bag,"secret")];',
  'const bag={secret:3};const s=Symbol("secret");module.exports=[s in bag,"secret" in bag];'
]){
  test('private in conservative refusal: '+source.slice(0,94),()=>check(source,0));
}
