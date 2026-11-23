'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/**
 * The Node CommonJS loader wraps a module in an *implicit* non-strict
 * function. That wrapper is absent from Acorn's parsed Program AST, yet a
 * foreign CommonJS function called at module top level can observe it via
 * Function#caller and obtain its complete original source.
 */
const directHelper=[
  'function inspect(){',
  '  return Function.prototype.toString.call(inspect.caller);',
  '}',
  'module.exports=inspect;'
].join('\n');

const getterHelper=[
  'function inspect(){',
  '  return Function.prototype.toString.call(inspect.caller);',
  '}',
  "Object.defineProperty(exports,'source',{get:inspect});"
].join('\n');

const coercionHelper=[
  'let source;',
  'function coerce(){',
  '  source=Function.prototype.toString.call(coerce.caller);',
  '  return 3;',
  '}',
  'module.exports={value:{[Symbol.toPrimitive]:coerce},source(){return source;}};'
].join('\n');

const strictHelper=[
  'function inspect(){',
  '  try{return Function.prototype.toString.call(inspect.caller);}',
  '  catch(e){return e.name;}',
  '}',
  'module.exports=inspect;'
].join('\n');

/** @param {string} expression @param {boolean} [strict] @returns {string} */
function entry(expression,strict=false){
  return (strict?"'use strict';\n":'')+
    "const foreign=require('./observer.cjs');\n"+
    'const state={secretField:17,bonusField:5};\n'+
    'process.stdout.write(JSON.stringify(['+
    expression+']));\n';
}

/**
 * @param {string} directory
 * @param {string} code
 * @param {string} helper
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function run(directory,code,helper){
  await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(path.join(directory,'entry.cjs'),code,'utf8');
  await fs.writeFile(path.join(directory,'observer.cjs'),helper,'utf8');
  const p=spawnSync(process.execPath,[path.join(directory,'entry.cjs')],{
    encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1024*1024
  });
  if(p.error)throw p.error;
  return {status:p.status,stdout:p.stdout,stderr:p.stderr};
}

/**
 * @param {string} name
 * @param {string} body
 * @param {string} helper
 * @param {boolean} [strict]
 */
function compare(name,body,helper,strict=false){
  for(const backend of /** @type {const} */ (['hashed','symbol'])){
    test('CJS module wrapper source parity / '+name+'/'+backend,async()=>{
      const original=entry(body,strict);
      const compiled=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:original
      }],{
        mode:'sno',seed:'cjs-wrapper-caller/'+name+'/'+backend,
        strings:false,identifiers:false,properties:true,
        experimentalSymbolKeys:backend==='symbol'
      });
      const out=compiled.files[0];
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cjs-wrapper-source-'));
      try{
        const native=await run(path.join(root,'native'),original,helper);
        const protectedRun=await run(path.join(root,'output'),String(out.code),helper);
        assert.equal(native.status,0,native.stderr);
        assert.equal(protectedRun.status,0,protectedRun.stderr);
        assert.deepEqual(protectedRun,native,
          'Non-strict Node module wrapper is source-observable via a separate uncompiled helper');
      }finally{
        await fs.rm(root,{recursive:true,force:true});
      }
    });
  }
}

compare('top-level direct foreign call',
  'state.secretField+state.bonusField,foreign()',directHelper);
compare('top-level foreign getter',
  'state.secretField+state.bonusField,foreign.source',getterHelper);
compare('top-level foreign ToPrimitive',
  'state.secretField+state.bonusField+foreign.value,foreign.source()',coercionHelper);
compare('strict top-level observer positive control',
  'state.secretField+state.bonusField,foreign()',strictHelper,true);

test('top-level non-observing private arithmetic owner retains property renames',()=>{
  const original='const owner={secretField:17,bonusField:5};'+
    'module.exports=owner.secretField+owner.bonusField;';
  for(const backend of /** @type {const} */ (['hashed','symbol'])){
    const compiled=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:original
    }],{
      mode:'sno',seed:'cjs-wrapper-private/'+backend,
      identifiers:false,strings:false,properties:true,
      experimentalSymbolKeys:backend==='symbol'
    });
    assert.equal(compiled.files[0].metrics.properties,2,
      'Private own key yield must remain nonzero when wrapper text is unobserved');
  }
});
