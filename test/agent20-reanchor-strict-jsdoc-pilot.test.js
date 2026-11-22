'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const path=require('node:path');
const ts=require('typescript');

test('Agent 20 random anchor attackers and tests have strict JSDoc semantics',()=>{
  const files=[
    '../sims/random-affine-anchor-compatible-inversion.js',
    '../sims/random-affine-anchor-coverage.js',
    '../sims/hybrid-reanchor-cegar-attack.js',
    '../sims/compatible-linear-baseline-reanchor.js',
    '../sims/compatible-linear-baseline-width3-peer.js',
    '../sims/sparse-triangular-fixedpoint-width3-peer.js',
    'compatible-linear-baseline-reanchor.test.js',
    'compatible-linear-baseline-width3.test.js',
    'hybrid-reanchor-cegar-attack.test.js',
    'random-affine-anchor-compatible-inversion.test.js',
    'random-affine-anchor-coverage.test.js'
  ].map(value=>path.resolve(__dirname,value));
  const program=ts.createProgram(files,{
    allowJs:true,checkJs:true,noEmit:true,strict:true,
    target:ts.ScriptTarget.ES2022,
    module:ts.ModuleKind.CommonJS,
    moduleResolution:ts.ModuleResolutionKind.Node10,
    types:['node'],skipLibCheck:true,maxNodeModuleJsDepth:0
  });
  const errors=ts.getPreEmitDiagnostics(program).filter(item=>
    item.category===ts.DiagnosticCategory.Error);
  const details=errors.map(item=>ts.flattenDiagnosticMessageText(item.messageText,'\n'));
  assert.deepEqual(details,[]);
  console.log('AGENT20_REANCHOR_JSDOC '+JSON.stringify({
    strict:true,files:files.length,errors:errors.length
  }));
});
