'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {parse,observesDistributedSource}=require('../src/ast');
const {obfuscateFiles}=require('../src/core');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @type {SourceFile} */
const leaf={path:'leaf.mjs',sourceType:'module',
  code:'const record={privateField:23};const value=record.privateField;export function leaf(){return value;}'};
const sri='sha256-'+createHash('sha256').update(leaf.code).digest('base64');
const fragment='<link rel="modulepreload" href="./leaf.mjs?integrity=1" integrity="'+sri+'">';

/**
 * A static ESM graph whose source byte pin is installed through a DOM parser.
 * The only exported value is a primitive-returning function; no external
 * lexical variable is an alias for the private record.
 * @param {string} snippet
 * @returns {SourceFile[]}
 */
function graph(snippet){
  return [leaf,{path:'entry.mjs',sourceType:'module',
    code:"import {leaf} from './leaf.mjs';void leaf();\n"+snippet}];
}

for(const [label,body] of /** @type {[string,string][]} */ ([
  ['computed insertAdjacentHTML selector',
    "const method=['insert','AdjacentHTML'].join('');document.head[method]('beforeend',"+JSON.stringify(fragment)+");"],
  ['detached insertAdjacentHTML via Function.call',
    'const insert=document.head.insertAdjacentHTML;insert.call(document.head,"beforeend",'+JSON.stringify(fragment)+');'],
  ['detached insertAdjacentHTML via Reflect.apply',
    'const insert=document.head.insertAdjacentHTML;Reflect.apply(insert,document.head,["beforeend",'+JSON.stringify(fragment)+']);'],
  ['computed innerHTML setter',
    "const field=['inner','HTML'].join('');document.head[field]="+JSON.stringify(fragment)+';'],
  ['known innerHTML setter',
    'document.head.innerHTML='+JSON.stringify(fragment)+';'],
  ['known outerHTML setter',
    'document.head.outerHTML='+JSON.stringify(fragment)+';'],
  ['dynamic HTML payload into computed method',
    "const method=['insert','AdjacentHTML'].join('');const html="+JSON.stringify(fragment)+";document.head[method]('beforeend',html);"]
])) {
  test('distributed byte observer protects parser-created SRI through '+label,()=>{
    const files=graph(body);
    const observed=observesDistributedSource(parse(String(files[1].code),'module'));
    assert.equal(observed,true,label+': source observer must be detected');
    for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
      const result=obfuscateFiles(files,{
        mode,closedWorld:true,seed:'agent5-parser-sri-'+label,
        strings:false,identifiers:false
      });
      const compiled=result.files.find(file=>file.path==='leaf.mjs');
      assert.ok(compiled,mode+'/'+label);
      assert.equal(compiled.metrics.properties,0,mode+'/'+label+
        ': active SRI pin requires byte identity');
      assert.equal(compiled.code,leaf.code,mode+'/'+label);
    }
  });
}

for(const [label,body] of /** @type {[string,string][]} */ ([
  ['literal benign insertion',
    "document.head.insertAdjacentHTML('beforeend','<p>unrelated</p>');"],
  ['opaque computed method with benign literal input',
    "const method=['insert','AdjacentHTML'].join('');document.head[method]('beforeend','<p>unrelated</p>');"],
  ['benign reflected native insert',
    "const insert=document.head.insertAdjacentHTML;Reflect.apply(insert,document.head,['beforeend','<p>unrelated</p>']);"],
  ['benign computed HTML field',
    "const field=['inner','HTML'].join('');document.head[field]='<p>unrelated</p>';"]
])) {
  test('benign non-integrity parser use retains private-key rewrite: '+label,()=>{
    const files=graph(body);
    assert.equal(observesDistributedSource(parse(String(files[1].code),'module')),false,label);
    const result=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'agent5-benign-parser-'+label,
      strings:false,identifiers:false
    });
    const emitted=result.files.find(file=>file.path==='leaf.mjs');
    assert.ok((emitted?.metrics.properties??0)>0,label+': unrelated private rewrite lost');
  });
}

test('SRI source-observer gate treats member token names as grammar, not global references',()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'owner.mjs',sourceType:'module',code:[
      'const record={top:23,parent:7,opener:19};',
      'const value=record.top+record.parent+record.opener;',
      'export function leaf(){return value;}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:
      "import {leaf} from './owner.mjs';console.log(leaf());"}
  ];
  const owner=parse(String(files[0].code),'module');
  assert.equal(observesDistributedSource(owner),false);
  const result=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'agent5-windowproxy-grammar-tokens',
    strings:false,identifiers:false,
    experimentalSourceObserverIslands:['owner.mjs']
  });
  const emitted=result.files.find(file=>file.path==='owner.mjs');
  assert.equal(emitted?.metrics.properties,3,
    'actual browser-root reference is distinct from a private own key');
});
