'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {test}=require('node:test');
const ts=require('typescript');

/**
 * @param {import('typescript').Node} node
 * @returns {boolean}
 */
function isFunctionScope(node) {
  return ts.isFunctionDeclaration(node)||ts.isFunctionExpression(node)||
    ts.isArrowFunction(node)||ts.isMethodDeclaration(node)||
    ts.isConstructorDeclaration(node)||ts.isGetAccessorDeclaration(node)||
    ts.isSetAccessorDeclaration(node);
}

/**
 * @param {string} source
 * @param {number} referenceStart
 * @returns {{symbolName:string|null,declarations:Array<{kind:string,parent:string,fileName:string,flags:number,parentFlags:number}>,hasDirectEval:boolean,hasWith:boolean}}
 */
function inspectReference(source,referenceStart) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-ts-binding-oracle-'));
  const fileName=path.join(directory,'probe.ts');
  try {
    fs.writeFileSync(fileName,source,'utf8');
    const options={
      allowJs:true,
      checkJs:true,
      noEmit:true,
      module:ts.ModuleKind.None,
      target:ts.ScriptTarget.ES2022,
      lib:['lib.es2022.d.ts','lib.dom.d.ts'],
      types:[]
    };
    const program=ts.createProgram([fileName],options);
    const sourceFile=program.getSourceFile(fileName);
    assert.ok(sourceFile);
    const checker=program.getTypeChecker();
    /** @type {import('typescript').Identifier|undefined} */
    let reference;
    /** @param {import('typescript').Node} node */
    function findReference(node) {
      if(ts.isIdentifier(node)&&node.getStart(sourceFile)===referenceStart) {
        reference=node;
        return;
      }
      ts.forEachChild(node,findReference);
    }
    findReference(sourceFile);
    assert.ok(reference,'reference identifier was not found at the supplied source offset');
    const symbol=checker.getSymbolAtLocation(reference);
    const declarations=(symbol?.declarations??[]).map(declaration=>({
      kind:ts.SyntaxKind[declaration.kind],
      parent:ts.SyntaxKind[declaration.parent.kind],
      fileName:declaration.getSourceFile().fileName,
      flags:declaration.flags,
      parentFlags:declaration.parent.flags
    }));
    let hasDirectEval=false;
    let hasWith=false;
    /**
     * Scan one lexical scope, but do not attribute eval in nested functions to
     * the enclosing function's variable environment.
     * @param {import('typescript').Node} node
     * @param {import('typescript').Node} root
     */
    function scanScope(node,root) {
      if(node!==root&&isFunctionScope(node)) return;
      if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='eval'&&!node.questionDotToken) {
        hasDirectEval=true;
      }
      ts.forEachChild(node,child=>scanScope(child,root));
    }
    for(let current=reference.parent;current;current=current.parent) {
      if(ts.isWithStatement(current)) hasWith=true;
      if(isFunctionScope(current)||ts.isSourceFile(current)) scanScope(current,current);
    }
    return {
      symbolName:symbol?.getName()??null,
      declarations,
      hasDirectEval,
      hasWith
    };
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
}

test('TypeScript checker provides binding-identity oracle for supported lexical roots',()=>{
  const globalSource='window.onerror=handler;';
  const global=inspectReference(globalSource,globalSource.indexOf('window.onerror'));
  assert.equal(global.symbolName,'window');
  assert.ok(global.declarations.some(d=>d.fileName.endsWith('lib.dom.d.ts')));

  const parameterSource='function f(window){window.onerror=handler;}';
  const parameter=inspectReference(parameterSource,parameterSource.indexOf('window.onerror'));
  assert.ok(parameter.declarations.some(d=>d.kind==='Parameter'));

  const catchSource='try{}catch(window){window.onerror=handler;}';
  const caught=inspectReference(catchSource,catchSource.indexOf('window.onerror'));
  assert.ok(caught.declarations.some(d=>d.parent==='CatchClause'));

  const classSource='function f(){class window{method(){return window;}}return new window();}';
  const className=inspectReference(classSource,classSource.indexOf('return window')+'return '.length);
  assert.ok(className.declarations.some(d=>d.kind==='ClassDeclaration'));

  const namedFunctionSource='const f=function window(){return window;};';
  const namedFunction=inspectReference(namedFunctionSource,namedFunctionSource.indexOf('return window')+'return '.length);
  assert.ok(namedFunction.declarations.some(d=>d.kind==='FunctionExpression'));

  const varSource='function f(){{var window={};}return window;}';
  const hoistedVar=inspectReference(varSource,varSource.lastIndexOf('window'));
  assert.ok(hoistedVar.declarations.some(d=>d.kind==='VariableDeclaration'));
  assert.ok(hoistedVar.declarations.some(d=>d.parent==='VariableDeclarationList'&&(d.parentFlags & ts.NodeFlags.BlockScoped)===0));

  const destructuredSource='function f({window}){return window;}';
  const destructured=inspectReference(destructuredSource,destructuredSource.lastIndexOf('window'));
  assert.ok(destructured.declarations.some(d=>d.kind==='BindingElement'));

  const blockLetSource='function f(){{let window={};return window;}}';
  const blockLet=inspectReference(blockLetSource,blockLetSource.lastIndexOf('window'));
  assert.ok(blockLet.declarations.some(d=>d.kind==='VariableDeclaration'&&(d.parentFlags & ts.NodeFlags.BlockScoped)!==0));
});

test('with leaves host-root lookup unresolved in the TypeScript checker probe',()=>{
  const source='with(obj){window.onerror=handler;}';
  const result=inspectReference(source,source.indexOf('window.onerror'));
  assert.equal(result.symbolName,null);
  assert.equal(result.hasWith,true);
});

test('direct eval can leave an ambient checker symbol but must make the affected scope unknown',()=>{
  const source='function f(){eval("var window = {}");window.onerror=handler;}';
  const result=inspectReference(source,source.indexOf('window.onerror'));
  assert.equal(result.symbolName,'window');
  assert.ok(result.declarations.some(d=>d.fileName.endsWith('lib.dom.d.ts')));
  assert.equal(result.hasDirectEval,true);
});

test('direct eval in an enclosing function makes a nested function root unknown',()=>{
  const source='function outer(){eval("var window = {}");return function inner(){window.onerror=handler;};}';
  const result=inspectReference(source,source.indexOf('window.onerror'));
  assert.equal(result.symbolName,'window');
  assert.equal(result.hasDirectEval,true);
});

test('direct eval in a sibling function does not taint a separate nested function',()=>{
  const source='function outer(){function sibling(){eval("var window = {}");}return function inner(){window.onerror=handler;};}';
  const result=inspectReference(source,source.indexOf('window.onerror'));
  assert.equal(result.symbolName,'window');
  assert.equal(result.hasDirectEval,false);
});
