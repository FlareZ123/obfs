'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * An external Web IDL or host API is outside the obfuscator's transformed
 * file group. Its accepted DOMString/USVString values are observable and can
 * implicitly trigger Function.prototype.toString without a source-level
 * String(), toString(), or imported source observer in the protected file.
 *
 * These shims implement only the ToString edge. Browser-specific CSS parsing,
 * cookie persistence and attribute reflection are not asserted here.
 * @param {string} source
 * @returns {{result:unknown,captures:string[]}}
 */
function execute(source){
  /** @type {string[]} */
  const captures=[];
  /** @param {unknown} value */
  const observe=value=>{captures.push(String(value));};
  const style={
    setProperty:(_name,value)=>observe(value),
    set cssText(value){observe(value);}
  };
  const dataset=new Proxy({},{
    set(_target,_name,value){observe(value);return true;}
  });
  const body={
    setAttribute:(_name,value)=>observe(value),
    setAttributeNS:(_namespace,_name,value)=>observe(value),
    style,dataset,
    set textContent(value){observe(value);},
    set innerText(value){observe(value);}
  };
  const document={
    body,
    getElementById:(_id)=>body,
    querySelector:(_selector)=>body,
    createElement:(_tag)=>body,
    set cookie(value){observe(value);}
  };
  const context={
    document,window:{externalStringSink:observe},
    module:{exports:null},
    externalStringSink:observe
  };
  vm.runInNewContext(source,context,{timeout:3000});
  return {result:context.module.exports,captures};
}

const functionSource='function inspect(){const privateSourceMarker=17;return privateSourceMarker;}\n';
const operations=[
  {id:'html-attribute',code:'document.body.setAttribute("data-source",inspect);'},
  {id:'attribute-namespace',code:'document.body.setAttributeNS(null,"data-source",inspect);'},
  {id:'dom-dataset',code:'document.body.dataset.source=inspect;'},
  {id:'css-setProperty',code:'document.body.style.setProperty("--source",inspect);'},
  {id:'css-cssText',code:'document.body.style.cssText=inspect;'},
  {id:'node-textContent',code:'document.body.textContent=inspect;'},
  {id:'node-innerText',code:'document.body.innerText=inspect;'},
  {id:'document-cookie',code:'document.cookie=inspect;'},
  {id:'opaque-window-host',code:'window.externalStringSink(inspect);'},
  {id:'opaque-global-host',code:'externalStringSink(inspect);'},
];

test('source-free direct private helper remains rewrite-eligible in all modes',()=>{
  const source=functionSource+'module.exports=inspect();';
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const out=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],
      {mode,seed:'agent7-domstring-positive',properties:false,strings:false,identifiers:true});
    assert.ok(out.files[0].metrics.bindings>0,mode+' positive identifier yield');
    assert.equal(execute(String(out.files[0].code)).result,17);
  }
});

test('external DOMString/host coercion preserves exact source, not just return value',()=>{
  /** @type {string[]} */
  const mismatches=[];
  for(const operation of operations.filter(item=>!item.id.startsWith('opaque-'))){
    const source=functionSource+operation.code+'\nmodule.exports=inspect();';
    const native=execute(source);
    assert.equal(native.result,17,operation.id);
    assert.equal(native.captures.length,1,operation.id);
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      const out=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],
        {mode,seed:'agent7-domstring-'+operation.id,properties:false,strings:false,identifiers:true});
      const item=out.files[0];
      const emitted=execute(String(item.code));
      const observer=observesFunctionSource(parse(source,'commonjs'));
      const record={mode,operation:operation.id,observer,
        bindings:item.metrics.bindings,numericParity:native.result===emitted.result,
        sourceParity:native.captures[0]===emitted.captures[0]};
      console.log(JSON.stringify(record));
      assert.equal(emitted.result,native.result,mode+' '+operation.id+' computation');
      if(emitted.captures[0]!==native.captures[0])
        mismatches.push(mode+' '+operation.id+' bindings='+item.metrics.bindings);
    }
  }
  assert.deepEqual(mismatches,[],
    'source-visible host coerctions must all preserve native function bytes');
});

test('opaque host functions remain outside the bounded native DOM provenance proof',()=>{
  for(const operation of operations.filter(item=>item.id.startsWith('opaque-'))){
    const source=functionSource+operation.code+'\nmodule.exports=inspect();';
    assert.equal(observesFunctionSource(parse(source,'commonjs')),false,
      operation.id+' unresolved host source observer');
    const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],
      {mode:'coo',seed:'agent7-opaque-host-boundary',properties:false,
       strings:false,identifiers:true});
    assert.ok(output.files[0].metrics.bindings>0,operation.id+' positive transform');
    assert.notDeepEqual(execute(String(output.files[0].code)).captures,
      execute(source).captures,operation.id+' remains an explicit source-parity risk');
  }
});

test('DOMString source proof follows document/element/style aliases and destructuring',()=>{
  const forms=[
    'const doc=document;const target=doc.getElementById("target");target.setAttribute("data-source",inspect);',
    'const {body:target}=document;target.dataset.source=inspect;',
    'const doc=globalThis.document;const {body:target}=doc;target.textContent=inspect;',
    'const target=document.querySelector("#target");const alias=target;const style=alias.style;style.setProperty("--source",inspect);',
    'const {document:doc}=globalThis;const node=doc.createElement("span");node.innerText=inspect;'
  ];
  for(const form of forms){
    const source=functionSource+form+'\nmodule.exports=inspect();';
    assert.equal(observesFunctionSource(parse(source,'commonjs')),true,
      form+' source observer classification');
    const native=execute(source);
    assert.equal(native.result,17);
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],
        {mode,seed:'agent7-dom-alias-coverage',properties:false,strings:false,identifiers:true});
      const compiled=execute(String(result.files[0].code));
      assert.deepEqual(compiled.captures,native.captures,mode+' '+form);
      assert.equal(compiled.result,native.result,mode+' '+form);
      assert.equal(result.files[0].metrics.bindings,0,
        mode+' '+form+' source identity must remain');
    }
  }
});
