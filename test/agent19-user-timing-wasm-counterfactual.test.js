'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');
const {lowerWasmI32Functions}=require('../src/wasm-i32');

const original='export function inspect(a){return a^17;}'+
  'export const view={text:performance.mark(inspect).name,value:inspect(31)};';
/** @param {string} code @returns {Promise<{text:string,value:number}>} */
async function evaluate(code) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'timing-wasm-'));
  try {
    await fs.writeFile(path.join(root,'entry.mjs'),code,'utf8');
    const loaded=await import(pathToFileURL(path.join(root,'entry.mjs')).href);
    return loaded.view;
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('native User Timing name prevents explicit selected-Wasm function replacement',async()=>{
  const native=await evaluate(original);
  assert.equal(native.value,14);
  assert.match(native.text,/inspect/);
  // The raw lowerer intentionally refuses an observed source. To establish
  // that the selected function is *otherwise* eligible and would change
  // observable text if this guard were bypassed, lower an identical function
  // in a primitive-name program, then reattach the observer post lowering.
  const benign=original.replace('performance.mark(inspect).name','"benign mark"');
  assert.equal(observesFunctionSource(parse(benign,'module')),false);
  const lower=lowerWasmI32Functions(benign,'module',{
    names:['inspect'],seed:'user-timing-native-wasm-counterfactual'
  });
  assert.equal(lower.functions,1,'Selected i32 function must be otherwise lowerable');
  const counterfactualCode=lower.code.replace('"benign mark"','performance.mark(inspect).name');
  assert.notEqual(counterfactualCode,lower.code,
    'Counterfactual must reattach the actual native source observer');
  const counterfactual=await evaluate(counterfactualCode);
  assert.equal(counterfactual.value,native.value);
  assert.notEqual(counterfactual.text,native.text,
    'Source-changing Wasm must be refused when a native mark observes the callable');

  assert.equal(observesFunctionSource(parse(original,'module')),true,
    'Native User Timing must be recognized as a source observer');
  assert.throws(()=>obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:original
  }],{
    mode:'coo',closedWorld:true,seed:'user-timing-wasm-veto',
    identifiers:false,properties:false,strings:false,
    experimentalWasmI32:{'entry.mjs':['inspect']}
  }),/Wasm i32 requires|declined|source/i,
  'The compiler must not permit explicit source-changing Wasm under native User Timing');
});

test('primitive User Timing mark permits explicit selected Wasm backend with parity',async()=>{
  const source='export function inspect(a){return a^17;}'+
    'export const view={text:performance.mark("fixed User Timing name").name,'+
      'value:inspect(31)};';
  const native=await evaluate(source);
  assert.deepEqual(native,{text:'fixed User Timing name',value:14});
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    const output=obfuscateFiles([{
      path:'entry.mjs',sourceType:'module',code:source
    }],{
      mode,closedWorld:true,seed:'agent19-primitive-selected-wasm/'+mode,
      strings:false,identifiers:false,properties:false,
      experimentalWasmI32:{'entry.mjs':['inspect']}
    }).files[0];
    assert.equal(output.metrics.wasmI32Functions,1,
      'Native User Timing primitive mark must leave selected Wasm available');
    assert.deepEqual(await evaluate(String(output.code)),native);
  }
});

test('all seven selected source-changing backends refuse one-file observed callable',()=>{
  const selected=[
    'experimentalRegisterVm',
    'experimentalExpressionVm',
    'experimentalNativeGraph',
    'experimentalBranchBlocks',
    'experimentalStatementFlow',
    'experimentalWasmI32',
    'experimentalPolyvariantAffine'
  ];
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    for(const key of selected) {
      const config={mode,closedWorld:true,
        seed:'agent19-source-observer-selected-'+mode+'/'+key,
        strings:false,identifiers:false,properties:false};
      // The selected option is dynamically keyed solely inside the test;
      // the production type contract is unaffected.
      const options=/** @type {any} */ (config);
      options[key]={'entry.mjs':['inspect']};
      assert.throws(()=>obfuscateFiles([{
        path:'entry.mjs',sourceType:'module',code:original
      }],options),/source observation/i,
      key+' must decline when User Timing observes selected function source');
    }
  }
});
