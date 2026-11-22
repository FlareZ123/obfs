'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const {test}=require('node:test');
const ts=require('typescript');

test('Agent 20 hidden-compatible source audit strict JSDoc',()=>{
  const files=[
    path.resolve(__dirname,'../sims/hidden-compatible-interpolant-source-audit.js'),
    path.resolve(__dirname,'hidden-compatible-interpolant-source-audit.test.js')
  ];
  const program=ts.createProgram(files,{
    allowJs:true,checkJs:true,noEmit:true,strict:true,
    target:ts.ScriptTarget.ES2022,
    module:ts.ModuleKind.CommonJS,
    moduleResolution:ts.ModuleResolutionKind.Node10,
    types:['node'],skipLibCheck:true,maxNodeModuleJsDepth:0
  });
  const errors=ts.getPreEmitDiagnostics(program).filter(d=>
    d.category===ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[]);
  console.log('AGENT20_COMPATIBLE_AUDIT_JSDOC '+JSON.stringify({
    files:files.length,errors:errors.length
  }));
});
