'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const acorn=require('acorn');
const {obfuscateFiles}=require('../src/core');
const {recoverPublicWasmExpression}=require('../sims/wasm-i32-static-recover');

const expression='(((x^137)&(x>>>3))|(x<<7))';
const hiddenSource='function secretI32(x){return '+expression+';}';
const publicSource='function published(x){return secretI32(x);}';
const boundary=[-2147483648,2147483647,-1,0,1,255,-0,NaN,Infinity,-Infinity,1.5,-1.5];

/**
 * Independently lift the public Wasm arithmetic and published facade from
 * the distributed artifact, with no original private source or compiler import
 * in the reconstruction path. Acorn and the published bytecode extractor are
 * standalone attacker-side tools.
 *
 * @param {string} emitted
 * @param {'commonjs'|'module'} sourceType
 * @returns {{source:string,privateName:string,facade:string,recoveredExpression:string}}
 */
function staticClone(emitted,sourceType){
  const parsed=acorn.parse(emitted,{ecmaVersion:'latest',
    sourceType:sourceType==='module'?'module':'script',allowReturnOutsideFunction:true});
  /** @type {import('acorn').FunctionDeclaration|undefined} */
  let published;
  for(const statement of parsed.body){
    if(statement.type==='FunctionDeclaration'&&statement.id?.name==='published')
      published=statement;
    if(statement.type==='ExportNamedDeclaration'&&
       statement.declaration?.type==='FunctionDeclaration'&&
       statement.declaration.id?.name==='published')
      published=statement.declaration;
  }
  assert.ok(published,'Public facade must be directly present in distributed JS');
  const ret=published.body.body.find(statement=>statement.type==='ReturnStatement');
  assert.ok(ret?.type==='ReturnStatement'&&ret.argument?.type==='CallExpression');
  assert.equal(ret.argument.callee.type,'Identifier');
  const privateName=/** @type {import('acorn').Identifier} */(ret.argument.callee).name;
  const facade=emitted.slice(published.start,published.end);
  const recoveredExpression=recoverPublicWasmExpression(emitted,['x']).expression;
  const source='function '+privateName+'(x){return '+recoveredExpression+';}'+
    (sourceType==='module'?'export ':'')+facade+
    (sourceType==='commonjs'?'module.exports=published;':'');
  assert.doesNotMatch(source,/WebAssembly/u,
    'The reconstructed clone must use plain native JavaScript only');
  return {source,privateName,facade,recoveredExpression};
}

/** @param {string} source @returns {(x:number)=>number} */
function commonJs(source){
  const sandbox={module:{exports:null},globalThis};
  vm.runInNewContext(source,sandbox,{timeout:2500});
  return /** @type {(x:number)=>number} */(/** @type {unknown} */(sandbox.module.exports));
}

/** @param {string} source @returns {Promise<(x:number)=>number>} */
async function esm(source){
  const data='data:text/javascript;base64,'+Buffer.from(source,'utf8').toString('base64');
  const ns=await import(data);
  return /** @type {(x:number)=>number} */(ns.published);
}

/** @param {((x:number)=>number)[]} functions @returns {number} */
function compare(functions){
  let checks=0;
  for(const x of boundary){
    const first=functions[0](x);
    for(const fn of functions.slice(1))assert.ok(Object.is(fn(x),first),String(x));
    checks++;
  }
  for(let i=0;i<2048;i++){
    const x=(i*1664525)|0,first=functions[0](x);
    for(const fn of functions.slice(1))assert.ok(Object.is(fn(x),first),String(x));
    checks++;
  }
  return checks;
}

test('independent public-Wasm source decoder clones private helper behind exact facade',async()=>{
  /** @type {{type:string,mode:string,wasmFunctions:number,
   * privateName:string,bytes:number,checks:number,zeroOracleCalls:true}[]} */
  const rows=[];
  for(const type of /** @type {const} */(['commonjs','module'])){
    const original=hiddenSource+(type==='module'?'export ':'')+publicSource+
      (type==='commonjs'?'module.exports=published;':'');
    const baseline=type==='module'?await esm(original):commonJs(original);
    for(const mode of /** @type {const} */(['coo','sno','sco'])){
      const file=type==='module'?'entry.mjs':'entry.cjs';
      const out=obfuscateFiles([{path:file,sourceType:type,code:original}],{
        mode,seed:'agent38-source-only-wasm-facade-clone/'+type+'/'+mode,
        identifiers:false,properties:false,strings:false,
        experimentalWasmI32:{[file]:['secretI32']}
      }).files[0];
      assert.equal(out.metrics.wasmI32Functions,1);
      const attack=staticClone(String(out.code),type);
      assert.equal(attack.privateName,'secretI32');
      const originalCode=String(out.code);
      const protectedFn=type==='module'?await esm(originalCode):commonJs(originalCode);
      const attackerFn=type==='module'?await esm(attack.source):commonJs(attack.source);
      assert.equal(Function.prototype.toString.call(attackerFn),
        Function.prototype.toString.call(baseline));
      const checks=compare([baseline,protectedFn,attackerFn]);
      rows.push({type,mode,wasmFunctions:out.metrics.wasmI32Functions,
        privateName:attack.privateName,bytes:Buffer.byteLength(originalCode),
        checks,zeroOracleCalls:true});
    }
  }
  console.log('PRIVATE_WASM_FACADE_SOURCE_ONLY_CLONE '+JSON.stringify(rows));
  assert.equal(rows.length,6);
  assert.ok(rows.every(row=>row.checks===2060));
});
