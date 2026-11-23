'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

const cases=[
  ['unary plus','','+reader',true],
  ['unary minus','', '-reader',true],
  ['bitwise not','', '~reader',true],
  ['binary addition','', "reader+''",true],
  ['binary subtraction','', 'reader-1',true],
  ['binary multiplication','', 'reader*1',true],
  ['binary division','', 'reader/1',true],
  ['binary remainder','', 'reader%1',true],
  ['binary exponentiation','', 'reader**1',true],
  ['binary left shift','', 'reader<<1',true],
  ['binary signed right shift','', 'reader>>1',true],
  ['binary unsigned right shift','', 'reader>>>1',true],
  ['binary bitwise and','', 'reader&1',true],
  ['binary bitwise or','', 'reader|1',true],
  ['binary bitwise xor','', 'reader^1',true],
  ['increment update','', 'reader++',true],
  ['decrement update','', 'reader--',true],
  ['compound addition','', 'reader+=1',true],
  ['compound subtraction','', 'reader-=1',true],
  ['compound multiplication','', 'reader*=1',true],
  ['Math.abs','', 'Math.abs(reader)',true],
  ['Math.max','', 'Math.max(reader,1)',true],
  ['Number','', 'Number(reader)',true],
  ['new Number','', 'new Number(reader).valueOf()',true],
  ['global isNaN','', 'isNaN(reader)',true],
  ['global isFinite','', 'isFinite(reader)',true],
  ['parseInt','', 'parseInt(reader,10)',true],
  ['parseFloat','', 'parseFloat(reader)',true],
  ['new Date','', 'new Date(reader).getTime()',true],
  ['Date.parse','', 'Date.parse(reader)',true],
  ['Number alias','const coerce=Number;', 'coerce(reader)',true],
  ['Math method alias','const coerce=Math.abs;', 'coerce(reader)',true],
  ['Math namespace alias','const M=Math;', 'M.abs(reader)',true],
  ['Math destructured method','const {abs}=Math;', 'abs(reader)',true],
  ['Math destructured renamed method','const {abs:coerce}=Math;', 'coerce(reader)',true],
  ['Math namespace alias chain','const M=Math;const N=M;', 'N.abs(reader)',true],
  ['Date namespace alias','const D=Date;', 'D.parse(reader)',true],
  ['Date.parse alias','const parse=Date.parse;', 'parse(reader)',true],
  ['Date destructured parse','const {parse}=Date;', 'parse(reader)',true],
  ['Number destructured parseInt','const {parseInt:coerce}=Number;', 'coerce(reader,10)',true],
  ['Number call','', 'Number.call(null,reader)',true],
  ['Number apply','', 'Number.apply(null,[reader])',true],
  ['Number bound with argument','', 'Number.bind(null,reader)()',true],
  ['Number bound alias','const coerce=Number.bind(null);', 'coerce(reader)',true],
  ['Math.abs call','', 'Math.abs.call(Math,reader)',true],
  ['Math.abs apply','', 'Math.abs.apply(Math,[reader])',true],
  ['Math.abs bound with argument','', 'Math.abs.bind(Math,reader)()',true],
  ['Math.abs bound alias','const coerce=Math.abs.bind(Math);', 'coerce(reader)',true],
  ['Reflect.apply Number','', 'Reflect.apply(Number,null,[reader])',true],
  ['Reflect.apply Math.abs','', 'Reflect.apply(Math.abs,Math,[reader])',true],
  ['Reflect.apply alias','const apply=Reflect.apply;', 'apply(Number,null,[reader])',true],
  ['Boolean positive control','', 'Boolean(reader)',false],
  ['typeof positive control','', 'typeof reader',false],
  ['logical not positive control','', '!reader',false],
  ['strict equality positive control','', 'reader===reader',false]
];

const patcher=[
  'const original=Function.prototype.toString;',
  'globalThis.__functionSources=[];',
  'Function.prototype.toString=function(){',
  '  const source=original.call(this);',
  '  globalThis.__functionSources.push(source);',
  '  return source;',
  '};',
  'export function install(){globalThis.__functionSources.length=0;}'
].join('\n');

async function run(code){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-to-primitive-'));
  try{
    const packageDir=path.join(root,'node_modules','patcher');
    await fs.mkdir(packageDir,{recursive:true});
    await fs.writeFile(path.join(packageDir,'package.json'),
      JSON.stringify({type:'module',exports:'./index.mjs'}));
    await fs.writeFile(path.join(packageDir,'index.mjs'),patcher);
    await atomicWrite(path.join(root,'app.mjs'),code);
    const entryUrl=pathToFileURL(path.join(root,'app.mjs')).href;
    const command='import('+JSON.stringify(entryUrl)+').then(m=>console.log(JSON.stringify({capturedSource:m.capturedSource,result:m.result,unrelatedResult:m.unrelatedResult}))).catch(e=>{console.error(e);process.exitCode=1});';
    const child=spawnSync(process.execPath,['--input-type=module','-e',command],{
      cwd:root,encoding:'utf8'
    });
    assert.equal(child.status,0,child.stderr);
    return JSON.parse(child.stdout.trim());
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('numeric and abstract coercions preserve source observed by an unlisted external patcher',async t=>{
  for(const [label,setup,expression,observes] of cases){
    await t.test(label,async()=>{
      const source=[
        "import {install} from 'patcher';",
        "function reader(secretValue){return secretValue+1;}",
        "const unrelatedPrivate=17;",
        setup,
        "install();",
        `export const result=${expression};`,
        "export const capturedSource=globalThis.__functionSources[0]??'';",
        "export const unrelatedResult=unrelatedPrivate;"
      ].join('\n');
      const output=obfuscateFiles([{path:'app.mjs',code:source}],{
        mode:'coo',seed:'to-primitive-source-observer',properties:false,
        strings:false,identifiers:true
      });
      const native=await run(source);
      const transformed=await run(output.files[0].code);
      assert.equal(native.unrelatedResult,17);
      assert.equal(transformed.unrelatedResult,17);
      if(observes){
        assert.ok(native.capturedSource.includes('secretValue'),
          'native coercion must call patched Function#toString');
        assert.equal(output.files[0].metrics.bindings,0,
          'a source-observed file must fail closed before identifier edits');
        assert.equal(output.files[0].code,source);
      }else{
        assert.equal(native.capturedSource,'',
          'the positive control must not invoke Function#toString');
        assert.ok(output.files[0].metrics.bindings>0,
          'non-coercive positive controls must retain genuine identifier yield');
        assert.ok(!output.files[0].code.includes('unrelatedPrivate'),
          'unrelated private bindings must remain renameable when no source observer exists');
        assert.notEqual(output.files[0].code,source);
      }
      assert.equal(transformed.capturedSource,native.capturedSource,
        'the external observer must see unchanged source or the compiler must refuse edits');
    });
  }
});
