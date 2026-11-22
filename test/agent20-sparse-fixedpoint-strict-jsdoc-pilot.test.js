'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const path=require('node:path');
const ts=require('typescript');

test('Agent 20 dedicated strict JSDoc for sparse compatible inversion research',()=>{
  const paths=[
    path.resolve(__dirname,'../sims/sparse-triangular-fixedpoint-inversion.js'),
    path.resolve(__dirname,'../sims/sparse-triangular-fixedpoint-width3-peer.js'),
    path.resolve(__dirname,'sparse-triangular-fixedpoint-inversion.test.js'),
    path.resolve(__dirname,'sparse-triangular-fixedpoint-width3.test.js')
  ];
  const program=ts.createProgram(paths,{
    allowJs:true,checkJs:true,noEmit:true,strict:true,
    target:ts.ScriptTarget.ES2022,
    module:ts.ModuleKind.CommonJS,
    moduleResolution:ts.ModuleResolutionKind.Node10,
    types:['node'],skipLibCheck:true,maxNodeModuleJsDepth:0
  });
  const diagnostics=ts.getPreEmitDiagnostics(program).filter(d=>d.category===ts.DiagnosticCategory.Error);
  const messages=diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n'));
  assert.deepEqual(messages,[]);
  console.log('AGENT20_SPARSE_JSDOC '+JSON.stringify({
    strict:true,rootFiles:paths.length,diagnostics:diagnostics.length
  }));
});
