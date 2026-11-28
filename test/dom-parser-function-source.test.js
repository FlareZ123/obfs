'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src');

const base='function inspect(x){return x^17;}';
const observed=base+
  'module.exports=new DOMParser().parseFromString(inspect,"text/html").body.textContent;';

/**
 * Model only the Web IDL argument conversion and resulting text access.
 * The actual browser DOM parser is tested separately under Chromium.
 * @param {string} code
 * @returns {unknown}
 */
function observe(code){
  const module={exports:null};
  class FakeDOMParser{
    /** @param {unknown} source @param {string} type */
    parseFromString(source,type){
      assert.equal(type,'text/html');
      return {body:{textContent:String(source)}};
    }
  }
  vm.runInNewContext(code,{module,WebAssembly,Uint8Array,
    DOMParser:FakeDOMParser},{timeout:4000});
  return module.exports;
}

test('actual Wasm lowering changes a function consumed by DOMParser',()=>{
  const result=lowerWasmI32Functions(base,'commonjs',{
    seed:'domparser-counterfactual',names:['inspect']
  });
  assert.equal(result.functions,1);
  assert.equal(observe(observed),'function inspect(x){return x^17;}');
  assert.notEqual(observe(result.code+
    'module.exports=new DOMParser().parseFromString(inspect,"text/html").body.textContent;'),
    observe(observed));
});

test('DOMParser.parseFromString function-source observer must refuse Wasm',()=>{
  const result=lowerWasmI32Functions(observed,'commonjs',{
    seed:'domparser-frozen',names:['inspect']
  });
  assert.equal(result.functions,0);
  assert.equal(result.declined,1);
  assert.equal(result.code,observed);
});

for(const mode of /** @type {const} */(['coo','sco','sno'])){
  test(mode+' must reject selected Wasm with native DOMParser source coercion',()=>{
    assert.throws(()=>obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:observed
    }],{
      mode,seed:'domparser-observer/'+mode,
      identifiers:false,strings:false,properties:false,
      experimentalWasmI32:{'entry.cjs':['inspect']}
    }),/Wasm|declined|source/i);
  });
  test(mode+' retains selected Wasm for primitive DOMParser arguments',()=>{
    const source=base+
      'module.exports=[inspect(7),new DOMParser().parseFromString("literal","text/html").body.textContent];';
    const output=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'domparser-primitive/'+mode,
      identifiers:false,strings:false,properties:false,
      experimentalWasmI32:{'entry.cjs':['inspect']}
    });
    assert.match(output.files[0].code,/WebAssembly/,
      'Primitive DOMParser input must not veto unrelated Wasm');
    assert.equal(JSON.stringify(observe(output.files[0].code)),
      JSON.stringify(observe(source)));
  });
}

/** @type {Array<[string,string]>} */
const aliases=[
  ['direct','module.exports=new DOMParser().parseFromString(inspect,"text/html").body.textContent;'],
  ['global','module.exports=new globalThis.DOMParser().parseFromString(inspect,"text/html").body.textContent;'],
  ['constructor-alias','const Parser=DOMParser;module.exports=new Parser().parseFromString(inspect,"text/html").body.textContent;'],
  ['global-destructured','const {DOMParser:Parser}=globalThis;module.exports=new Parser().parseFromString(inspect,"text/html").body.textContent;'],
  ['receiver-alias','const parser=new DOMParser();const other=parser;module.exports=other.parseFromString(inspect,"text/html").body.textContent;'],
  ['computed','const parser=new DOMParser();module.exports=parser["parse"+"FromString"](inspect,"text/html").body.textContent;'],
  ['unknown-key','const parser=new DOMParser();const key="parseFromString";module.exports=parser[key](inspect,"text/html").body.textContent;'],
  ['bound-method','const parser=new DOMParser();const bound=parser.parseFromString.bind(parser);module.exports=bound(inspect,"text/html").body.textContent;'],
  ['inline-bound','const parser=new DOMParser();module.exports=parser.parseFromString.bind(parser)(inspect,"text/html").body.textContent;'],
  ['reflect-inline-bound','const parser=new DOMParser();module.exports=Reflect.apply(parser.parseFromString.bind(parser),parser,[inspect,"text/html"]).body.textContent;'],
  ['prebound-input','const parser=new DOMParser();const bound=parser.parseFromString.bind(parser,inspect,"text/html");module.exports=bound().body.textContent;'],
  ['call','const parser=new DOMParser();module.exports=parser.parseFromString.call(parser,inspect,"text/html").body.textContent;'],
  ['apply','const parser=new DOMParser();module.exports=parser.parseFromString.apply(parser,[inspect,"text/html"]).body.textContent;'],
  ['reflect-apply','const parser=new DOMParser();module.exports=Reflect.apply(parser.parseFromString,parser,[inspect,"text/html"]).body.textContent;'],
  ['prototype','const parser=new DOMParser();module.exports=DOMParser.prototype.parseFromString.call(parser,inspect,"text/html").body.textContent;'],
  ['prototype-alias','const parser=new DOMParser();const parse=DOMParser.prototype.parseFromString;module.exports=parse.call(parser,inspect,"text/html").body.textContent;'],
  ['destructured-method','const parser=new DOMParser();const {parseFromString:parse}=parser;module.exports=parse.call(parser,inspect,"text/html").body.textContent;']
];

for(const [name,consumer] of aliases){
  test('DOMParser native source-observation guard: '+name,()=>{
    const source=base+consumer;
    assert.equal(observe(source),observe(observed),
      'Host parser should see the exact unchanged function source');
    const result=lowerWasmI32Functions(source,'commonjs',{
      seed:'domparser-alias/'+name,names:['inspect']
    });
    assert.equal(result.functions,0,name+' source observer must decline');
    assert.equal(result.declined,1);
    assert.equal(result.code,source);
  });
}
