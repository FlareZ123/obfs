'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} source
 * @returns {{value:unknown,source:string|null,invoked:boolean}}
 */
function observe(source){
  const seen={source:null,invoked:false};
  const context={
    module:{exports:null},
    queueMicrotask(callback){seen.source=Function.prototype.toString.call(callback);}
  };
  vm.runInNewContext(source,context,{timeout:2500});
  return {value:context.module.exports,...seen};
}

const access=[
  {
    name:'computed-property',
    read:'holder[key]'
  },
  {
    name:'reflect-get',
    read:'Reflect.get(holder,key)'
  },
  {
    name:'property-descriptor-value',
    read:'Object.getOwnPropertyDescriptor(holder,key).value'
  }
];

for(const mode of /** @type {const} */ (['coo','sco','sno'])){
  for(const item of access){
    test(mode+' dynamic/reflection red control: identifier transform changes host-held callback source through '+item.name,()=>{
      const source=[
        'function hidden(inputValue){return inputValue+1;}',
        'const holder={callback:hidden};',
        "const key='callback';",
        'queueMicrotask('+item.read+');',
        'module.exports=0;'
      ].join('\n');
      const native=observe(source);
      const compiled=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:source
      }],{
        mode,seed:'agent9-dynamic-host-held-identifier-'+mode+'-'+item.name,
        identifiers:true,strings:false,properties:false
      });
      const emitted=observe(String(compiled.files[0].code));
      assert.ok(compiled.files[0].metrics.bindings>=1);
      assert.notEqual(emitted.source,native.source);
      assert.equal(emitted.value,native.value);
      assert.equal(emitted.invoked,false);
      console.log('AGENT9_DYNAMIC_HOST_HELD_IDENTIFIER '+JSON.stringify({
        mode,access:item.name,native:native.source,emitted:emitted.source
      }));
    });

    test(mode+' dynamic/reflection positive: string pass conservatively preserves source and skips literals through '+item.name,()=>{
      const source=[
        "function hidden(inputValue){return inputValue+'callbackSourceLiteral';}",
        'const holder={callback:hidden};',
        "const key='callback';",
        'queueMicrotask('+item.read+');',
        "module.exports='unrelatedLiteral'.length;"
      ].join('\\n');
      const native=observe(source);
      const compiled=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:source
      }],{
        mode,seed:'agent9-dynamic-host-held-string-'+mode+'-'+item.name,
        identifiers:false,strings:true,properties:false
      });
      const emitted=observe(String(compiled.files[0].code));
      assert.equal(compiled.files[0].metrics.literals,0);
      assert.equal(emitted.source,native.source);
      assert.equal(emitted.value,native.value);
      assert.equal(emitted.invoked,false);
      console.log('AGENT9_DYNAMIC_HOST_HELD_STRING '+JSON.stringify({
        mode,access:item.name,literals:compiled.files[0].metrics.literals,
        native:native.source,emitted:emitted.source,sourceEqual:emitted.source===native.source
      }));
    });
      const emitted=observe(String(compiled.files[0].code));
      assert.ok(compiled.files[0].metrics.literals>=1);
      assert.notEqual(emitted.source,native.source);
      assert.equal(emitted.value,native.value);
      assert.equal(emitted.invoked,false);
      console.log('AGENT9_DYNAMIC_HOST_HELD_STRING '+JSON.stringify({
        mode,access:item.name,native:native.source,emitted:emitted.source
      }));
    });
  }
}
