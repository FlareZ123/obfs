'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {transformSync}=require('esbuild');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * A same-trust instrumented Node ESM host intercepts exactly the target's
 * native bind operation before it imports a published module.
 * @param {string} moduleUrl
 * @returns {{value:number,boundSource:string,privateBodies:string[]}}
 */
function instrument(moduleUrl){
  const script=[
    'const captured=[];',
    'const nativeBind=Function.prototype.bind;',
    'try{',
    '  Function.prototype.bind=function(...args){',
    '    const bound=Reflect.apply(nativeBind,this,args);',
    '    captured.push({bound,target:this});return bound;',
    '  };',
    '  const app=await import(process.argv[1]);',
    '  const value=app.hot(4,6);',
    '  const boundSource=app.hot.toString();',
    '  const origin=captured.find(pair=>pair.bound===app.hot);',
    '  const privateBodies=origin&&typeof origin.target==="function"',
    '    ?[Function.prototype.toString.call(origin.target)]:[];',
    '  process.stdout.write(JSON.stringify({value,boundSource,privateBodies}));',
    '}finally{Function.prototype.bind=nativeBind;}'
  ].join('\n');
  const child=spawnSync(process.execPath,['--input-type=module','-e',script,moduleUrl],{
    encoding:'utf8',timeout:15000
  });
  assert.equal(child.status,0,child.stderr);
  return /** @type {{value:number,boundSource:string,privateBodies:string[]}} */(
    JSON.parse(child.stdout)
  );
}

test('same pre-import bind interception recovers private target from minified and obfuscated ESM',async()=>{
  const source='const owner={secretField:7,otherField:11};'+
    'const internal=(privateFirst,privateSecond)=>{'+
    'return ((privateFirst+owner.secretField)^owner.otherField)+privateSecond;};'+
    'export const hot=internal.bind(null);';
  const minified=transformSync(source,{
    loader:'js',format:'esm',minify:true,legalComments:'none',target:'es2022'
  }).code;
  const mangled=transformSync(source,{
    loader:'js',format:'esm',minify:true,legalComments:'none',target:'es2022',
    mangleProps:/^(secretField|otherField)$/
  }).code;
  assert.doesNotMatch(mangled,/secretField|otherField/u,
    'the matched esbuild control must also rename the two private own fields');
  const published=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',seed:'matched-bound-runtime-obfs',closedWorld:true,
    identifiers:true,properties:true,strings:false
  });
  assert.equal(published.files[0].metrics.properties,2,
    'protected comparison must rewrite both own keys');
  const protectedCode=/** @type {string} */ (published.files[0].code);
  assert.doesNotMatch(protectedCode,/secretField|otherField/u);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-bind-minifier-control-'));
  try{
    /** @type {string[]} */
    const names=['native','minified','mangled','obfuscated'];
    const scripts=[source,minified,mangled,protectedCode];
    /** @type {ReturnType<typeof instrument>[]} */
    const results=[];
    for(let i=0;i<names.length;i++){
      const file=path.join(root,names[i]+'.mjs');
      await atomicWrite(file,scripts[i]);
      results.push(instrument(pathToFileURL(file).href));
    }
    const [native,control,mangledControl,obfuscated]=results;
    assert.equal(native.privateBodies.length,1);
    for(const observed of [control,mangledControl,obfuscated]){
      assert.equal(observed.privateBodies.length,1);
      assert.equal(observed.value,native.value);
      assert.equal(observed.boundSource,native.boundSource);
    }
    assert.match(control.privateBodies[0],/secretField/u,
      'plain minification retains field spelling in recovered function source');
    assert.doesNotMatch(mangledControl.privateBodies[0],/secretField|otherField/u,
      'esbuild property mangling also hides the original keys from the captured body');
    assert.match(obfuscated.privateBodies[0],/\._p[0-9a-f]{10}/u,
      'obfuscated build also exposes the actual rewritten function body');
    console.log('BOUND_RUNTIME_MINIFIED_CONTROL '+JSON.stringify({
      originalBytes:Buffer.byteLength(source),minifiedBytes:Buffer.byteLength(minified),
      mangledBytes:Buffer.byteLength(mangled),
      protectedBytes:Buffer.byteLength(protectedCode),
      attackerInterceptionMethod:'Function.prototype.bind',capturedTargetsPerBuild:1
    }));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
