'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const head='function protectedFn(secretArg){return secretArg+1;}';
const tail='export function sample(){return protectedFn(7);}';
/** @type {{name:string,middle:string,yield:boolean,observed:boolean,hostilePrototype?:boolean}[]} */
const variants=[
  {name:'null-proto-literal-inert',middle:
    'const document={__proto__:null};document.title=protectedFn;',yield:true,observed:false},
  {name:'null-proto-literal-two-inert-writes',middle:
    'const document={__proto__:null};document.title=protectedFn;document.title=protectedFn;',yield:true,observed:false},
  {name:'own-title-data-inert',middle:
    'const document={title:""};document.title=protectedFn;',yield:true,observed:false},
  {name:'own-title-data-hostile-inherited-setter',middle:
    'const document={title:""};document.title=protectedFn;',
    yield:true,observed:false,hostilePrototype:true},
  {name:'own-title-getter-is-not-data',middle:
    'const document={set title(value){globalThis.observed=String(value);}};document.title=protectedFn;',
    yield:false,observed:true},
  {name:'own-title-deletion-exposes-hostile-setter',middle:
    'const document={title:""};delete document.title;document.title=protectedFn;',
    yield:false,observed:true,hostilePrototype:true},
  {name:'unshadowed-native-document',middle:
    'document.title=protectedFn;',yield:false,observed:true},
  {name:'alias-of-native-document',middle:
    'const document=globalThis.document;document.title=protectedFn;',yield:false,observed:true},
  {name:'reassigned-native-document',middle:
    'let document={__proto__:null};document=globalThis.document;document.title=protectedFn;',
    yield:false,observed:true},
  {name:'nested-shadow-native-document',middle:
    'const document={__proto__:null};function sink(document){document.title=protectedFn;}sink(globalThis.document);',
    yield:false,observed:true},
  {name:'null-proto-direct-source-reader',middle:
    'const document={__proto__:null};document.title=protectedFn;globalThis.observed=String(document.title);',
    yield:false,observed:true},
  {name:'null-proto-reflective-setter',middle:
    'const document={__proto__:null};Object.defineProperty(document,"title",{set(v){globalThis.observed=String(v);}});document.title=protectedFn;',
    yield:false,observed:true},
  {name:'null-proto-observed-assignment-result',middle:
    'const document={__proto__:null};globalThis.observed=String(document.title=protectedFn);',
    yield:false,observed:true},
  {name:'null-proto-computed-key-conservative',middle:
    'const document={__proto__:null};document["title"]=protectedFn;',
    yield:false,observed:false},
  {name:'null-proto-read-conservative',middle:
    'const document={__proto__:null};document.title=protectedFn;void document.title;',
    yield:false,observed:false},
  {name:'caught-TDZ-error-before-null-proto-initialization',middle:
    'try{hoisted();}catch(e){globalThis.observed=String(e);}' +
    'const document={__proto__:null};' +
    'function hoisted(){document.title=protectedFn;}',
    yield:false,observed:true}
];
const runner=[
  'globalThis.observed="";',
  'let title="";',
  'globalThis.document={};',
  'Object.defineProperty(globalThis.document,"title",{',
  '  get(){return title;},',
  '  set(value){title=String(value);}',
  '});',
  "const {sample}=await import('./app.mjs');",
  'const result=sample();',
  'process.stdout.write(JSON.stringify({result,title,observed:globalThis.observed})+"\\n");'
].join('\n');
/**
 * @param {string} code
 * @param {boolean} [hostilePrototype]
 * @returns {{result:number,title:string,observed:string}}
 */
function run(code,hostilePrototype=false) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent4-document-'));
  try {
    fs.writeFileSync(path.join(dir,'app.mjs'),code);
    const setup=hostilePrototype?
      'Object.defineProperty(Object.prototype,"title",{configurable:true,set(value){globalThis.observed="host-"+String(value);}});':
      '';
    fs.writeFileSync(path.join(dir,'runner.mjs'),runner.replace('let title="";',
      setup+'\\nlet title="";'));
    const outcome=spawnSync(process.execPath,[path.join(dir,'runner.mjs')],{
      encoding:'utf8',cwd:dir,timeout:15000
    });
    assert.equal(outcome.status,0,outcome.stderr||outcome.error?.message);
    return JSON.parse(outcome.stdout);
  } finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
for(const variant of variants) {
  test('proven lexical non-host Document: '+variant.name,()=>{
    const source=variant.middle+'\n'+head+'\n'+tail;
    const observed=observesFunctionSource(parse(source,'module'));
    const native=run(source,variant.hostilePrototype);
    assert.equal(native.title.length>0||native.observed.length>0,variant.observed,
      'Native test must itself prove its declared observation boundary');
    const evidence=[];
    for(const mode of ['coo','sco','sno']) {
      const compiled=obfuscateFiles([{path:'app.mjs',sourceType:'module',code:source}],{
        mode,seed:'agent4-document-'+variant.name+'-'+mode,
        strings:false,properties:false,identifiers:true,closedWorld:true
      });
      const file=compiled.files[0];
      const out=run(String(file.code),variant.hostilePrototype);
      assert.deepEqual(out,native,
        'Native/emitted parity must hold for '+variant.name+' in '+mode);
      if(variant.yield)assert.ok(file.metrics.bindings>0,
        'A proved inert lexical document should not suppress all identifier protection');
      else assert.equal(file.metrics.bindings,0,
        'Unproved document provenance or source exposure must refuse rewrites');
      evidence.push({mode,bindings:file.metrics.bindings,parity:true});
    }
    console.log('LEXICAL_DOCUMENT '+JSON.stringify({name:variant.name,observed,native,evidence}));
  });
}
