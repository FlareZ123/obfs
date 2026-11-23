'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {parse}=require('../src/ast');
const {symbolizeLocalProperties}=require('../src/symbol-properties');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {buildSample}=require('../examples/symbol-keys/build-sample.cjs');

/** @param {string} code @returns {unknown[]} */
function run(code) {
  const scope={module:{exports:null}};
  vm.runInNewContext(code,scope,{timeout:2000});
  return Array.from(/** @type {unknown[]} */ (scope.module.exports));
}

test('local Symbol keys preserve mutation and are generated only once',()=>{
  const source="'use strict';\nconst bag={pulse:7,mask:3};\nfunction calc(x){bag.pulse+=x;return (bag.pulse^bag.mask)|0;}\nmodule.exports=[calc(2),calc(4),calc(-3)];\n";
  const result=symbolizeLocalProperties(source,parse(source,'commonjs'),{seed:'symbol-example-v1'});
  assert.equal(result.objects,1);
  assert.equal(result.properties,2);
  assert.equal((result.code.match(/=Symbol\(\)/gu)||[]).length,2);
  assert.doesNotMatch(result.code,/bag\.pulse|bag\.mask|\{pulse:/u);
  assert.deepEqual(run(result.code),run(source));
  const again=symbolizeLocalProperties(result.code,parse(result.code,'commonjs'),{seed:'symbol-example-v1'});
  assert.equal(again.code,result.code);
  assert.equal(again.properties,0);
});

test('exported callable keeps source spelling rather than receiving Symbol keys',()=>{
  const source="'use strict';\nconst bag={pulse:7,mask:3};\n"+
    "function calc(x){bag.pulse+=x;return (bag.pulse^bag.mask)|0;}\nmodule.exports=calc;\n";
  const result=symbolizeLocalProperties(source,parse(source,'commonjs'),{seed:'symbol-public-callable'});
  assert.equal(result.objects,0);
  assert.equal(result.properties,0);
  assert.equal(result.code,source);
  const scope={module:{exports:/** @type {unknown} */ (null)}};
  vm.runInNewContext(result.code,scope,{timeout:2000});
  assert.match(Function.prototype.toString.call(scope.module.exports),/bag\.pulse/u);
});

test('closed aliases, optional read and statically keyed destructuring retain their values',()=>{
  const source='const item={secretField:7,otherField:2};'+
    'const alias=item;const {secretField:read}=alias;'+
    'module.exports=[read,item?.otherField,item.secretField];';
  const out=symbolizeLocalProperties(source,parse(source,'commonjs'),{seed:'symbol-patterns'});
  assert.equal(out.objects,1,out.code);
  assert.equal(out.properties,2);
  assert.match(out.code,/\?\.\[_sk_/u);
  const execute=/** @param {string} code */ code=>{
    const context={module:{exports:null}};
    vm.runInNewContext(code,context);
    return JSON.stringify(context.module.exports);
  };
  assert.equal(execute(out.code),execute(source));
});

test('unknown owners, reflection, constructor shadowing, and source observers are declined',()=>{
  const declined=[
    'const bag={secret:4};module.exports=Object.keys(bag);',
    'const bag={secret:4};module.exports=bag[someUnknownKey];',
    'const bag={secret:4};module.exports=bag;',
    'const bag={secret:4};const Symbol=()=>0;module.exports=bag.secret;',
    'const bag={secret:4};function read(){return bag.secret;}module.exports=read.toString();',
    'export const bag={secret:4};console.log(bag.secret);'
  ];
  for(const source of declined) {
    const kind=source.startsWith('export')?'module':'commonjs';
    const out=symbolizeLocalProperties(source,parse(source,kind),{seed:'decline'});
    assert.equal(out.code,source);
    assert.equal(out.properties,0);
  }
});

test('COO and SNO opt-in generate executable, separate Symbol keys; default stays unchanged',()=>{
  const source='const bag={secret:7};module.exports=bag.secret;';
  for(const mode of /** @type {('coo'|'sno')[]} */ (['coo','sno'])) {
    const file={path:'index.cjs',sourceType:/** @type {'commonjs'} */ ('commonjs'),code:source};
    const base=obfuscateFiles([file],{mode,seed:'symbol-integration',strings:false,identifiers:false});
    const output=obfuscateFiles([file],{mode,seed:'symbol-integration',strings:false,
      identifiers:false,experimentalSymbolKeys:true});
    assert.equal(output.files[0].metrics.symbolKeys,1);
    assert.match(/** @type {string} */ (output.files[0].code),/=Symbol\(\)/u);
    assert.doesNotMatch(/** @type {string} */ (base.files[0].code),/=Symbol\(\)/u);
    const evaluate=/** @param {string} code */ code=>{
      const context={module:{exports:null}};
      vm.runInNewContext(code,context);
      return context.module.exports;
    };
    assert.equal(evaluate(/** @type {string} */ (output.files[0].code)),evaluate(source));
  }
});

test('real ESM two-file caller observes native values after local Symbol transformation',async()=>{
  const original=[
    {path:'state.mjs',sourceType:/** @type {'module'} */ ('module'),
      code:'const privateState={pulse:5,mask:3};function touch(x){privateState.pulse+=x;return privateState.pulse^privateState.mask;}export const results=[touch(2),touch(4)];\n'},
    {path:'entry.mjs',sourceType:/** @type {'module'} */ ('module'),
      code:'import {results} from "./state.mjs";console.log(...results);\n'}
  ];
  const transformed=obfuscateFiles(original,{mode:'coo',seed:'symbol-esm',strings:false,
    identifiers:false,experimentalSymbolKeys:true});
  assert.equal(transformed.files[0].metrics.symbolKeys,2);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-symbol-keys-'));
  try {
    /** @param {typeof original} files */
    async function execute(files) {
      for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
      const child=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{encoding:'utf8'});
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    }
    assert.equal(await execute(transformed.files),await execute(original));
  } finally {await fs.rm(root,{force:true,recursive:true});}
});


test('exported ESM callable source vetoes local Symbol-key transformation',()=>{
  const source='const privateState={pulse:5,mask:3};'+
    'export function touch(x){privateState.pulse+=x;return privateState.pulse^privateState.mask;}';
  const compiled=obfuscateFiles([{path:'state.mjs',sourceType:'module',code:source}],{
    mode:'coo',seed:'symbol-esm-exported-source',strings:false,
    identifiers:false,experimentalSymbolKeys:true
  });
  assert.equal(compiled.files[0].metrics.symbolKeys,0);
  assert.match(String(compiled.files[0].code),/privateState\.pulse/u);
});

test('private property read inside an observable failed callee remains unrenamed',()=>{
  // The failed .join call prints the complete callee, including the nested
  // private member's original source spelling in V8's TypeError message.
  const source='const bag={secretField:4};'+
    'Array.prototype.join=null;'+
    'try{[bag.secretField].join(",");}catch(error){module.exports=error.message;}';
  const out=symbolizeLocalProperties(source,parse(source,'commonjs'),
    {seed:'symbol-typeerror-callee'});
  assert.equal(out.objects,0);
  assert.equal(out.code,source);
  const context={module:{exports:null}};
  vm.runInNewContext(out.code,context,{timeout:1000});
  assert.match(String(context.module.exports),/bag\.secretField/u);
});

test('generated before-and-after sample is byte-for-byte reproducible',async()=>{
  await buildSample(true);
  const original=await fs.readFile(path.join(__dirname,'../examples/symbol-keys/before.cjs'),'utf8');
  const transformed=await fs.readFile(path.join(__dirname,'../examples/symbol-keys/after.cjs'),'utf8');
  assert.deepEqual(run(original),run(transformed));
});
