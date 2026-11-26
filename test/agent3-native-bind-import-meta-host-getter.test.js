'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/**
 * Run one module under a host that provides an effectful import.meta.env getter.
 * The getter mutates this realm's Function.prototype.bind before module code
 * reaches its top-level native-looking bind call.
 * @param {string} source
 * @returns {{capturedSource:string|null,result:number}}
 */
function runWithHostImportMetaGetter(source){
  const script=[
    "const vm=require('node:vm');",
    'const source='+JSON.stringify(source)+';',
    '(async()=>{',
    '  const context=vm.createContext({capturedSource:null});',
    '  const module=new vm.SourceTextModule(source,{context,initializeImportMeta(meta){',
    "    Object.defineProperty(meta,'env',{get(){",
    '      vm.runInContext("globalThis.__nativeBind=Function.prototype.bind; Function.prototype.bind=function(...args){globalThis.capturedSource=Function.prototype.toString.call(this); return Reflect.apply(globalThis.__nativeBind,this,args);};",context);',
    '      return {};',
    '    }});',
    '  }});',
    "  await module.link(()=>{throw new Error('unexpected import');});",
    '  await module.evaluate();',
    '  process.stdout.write(JSON.stringify({capturedSource:context.capturedSource,result:module.namespace.hot()}));',
    '})().catch(error=>{console.error(error);process.exit(1);});'
  ].join('\n');
  const child=spawnSync(process.execPath,['--experimental-vm-modules','-e',script],{
    encoding:'utf8',timeout:15000
  });
  assert.equal(child.status,0,child.stderr||child.error?.message);
  return /** @type {{capturedSource:string|null,result:number}} */(JSON.parse(child.stdout));
}

const source=[
  'const host=import.meta;',
  'const env=host.env;',
  'const owner={secretField:7};',
  'function internal(){return owner.secretField;}',
  'export const hot=internal.bind(null);'
].join('\n');

test('import.meta host getter can observe a bound target admitted by the source gate',()=>{
  const native=runWithHostImportMetaGetter(source);
  assert.equal(native.result,7);
  assert.match(String(native.capturedSource),/owner\.secretField/u);

  const compiled=obfuscateFiles([{
    path:'app.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',closedWorld:true,seed:'agent3-import-meta-bound-host-observer',
    properties:true,identifiers:false,strings:false
  });
  const app=compiled.files.find(file=>file.path==='app.mjs');
  assert.ok(app);
  assert.equal(app.metrics.properties,1,
    JSON.stringify({metrics:app.metrics,source:app.code}));

  const actual=runWithHostImportMetaGetter(String(app.code));
  process.stdout.write('IMPORT_META_BOUND_TARGET_OBSERVER '+JSON.stringify({
    native,actual,properties:app.metrics.properties,emittedSource:app.code
  })+'\n');

  assert.equal(actual.result,native.result);
  assert.match(String(actual.capturedSource),/_p[0-9a-f]{10}/u);
  assert.doesNotMatch(String(actual.capturedSource),/secretField/u);
  assert.notEqual(actual.capturedSource,native.capturedSource);
});
