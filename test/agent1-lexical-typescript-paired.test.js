'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const ts=require('typescript');
const acorn=require('acorn');
const path=require('node:path');
const {resolveLexicalReferences}=require('../workplace/agent1-lexical-reference-resolver');

/**
 * Independent TypeScript checker oracle for a bounded lexical-host-root
 * subset. No test result authorizes a runtime host/native identity claim.
 * @typedef {[string,string]} Template
 */

/** @type {Template[]} */
const templates=[
  ['global-block','{ /*MARK*/ window; }'],
  ['block-let','{ let window=0; /*MARK*/ window; }'],
  ['block-let-tdz','{ /*MARK*/ window; let window=0; }'],
  ['after-block','{ let window=0; } /*MARK*/ window;'],
  ['function-param','{ function f_N(window){/*MARK*/ window;} }'],
  ['function-free','{ function f_N(x){/*MARK*/ window;} }'],
  ['catch-id','{try{throw 1}catch(window){/*MARK*/ window;}}'],
  ['catch-pattern','{try{throw {window:1}}catch({window}){/*MARK*/ window;}}'],
  ['function-expression-name','{ const f_N=function window(){ /*MARK*/ window; }; }'],
  ['function-expression-sibling','{ const f_N=function window(){}; /*MARK*/ window; }'],
  ['function-var-hoisted','{ function f_N(){ {var window=0;} /*MARK*/ window;} }'],
  ['class-decl','{class window{} /*MARK*/ window;}'],
  ['class-expression-name','{const C_N=class window{method(){/*MARK*/ window;}};}'],
  ['class-expression-sibling','{const C_N=class window{}; /*MARK*/ window;}'],
  ['class-static-var','{class C_N{static{var window=0;}} /*MARK*/ window;}'],
  ['switch-let','{switch(1){case 1: let window=0; /*MARK*/ window;}}'],
  ['loop-let','{for(let window of [0]){/*MARK*/ window;}}'],
  ['after-loop','{for(let window of [0]){} /*MARK*/ window;}'],
  ['destructure','{const {window}={window:0}; /*MARK*/ window;}'],
  ['destructure-alias','{const {a:window}={a:0}; /*MARK*/ window;}'],
  ['param-default','{function f_N(window=0){/*MARK*/ window;}}'],
  ['param-default-before-body','{function f_N(x=/*MARK*/ window){let window=1;}}'],
  ['class-computed-key','{class C_N{[/*MARK*/ window]=0;}}'],
  ['object-computed-key','{const x_N = {[/*MARK*/ window]:0};}'],
  ['siblings','{function f_N(window){return window;} function g_N(){/*MARK*/ window;}}'],
  ['nested-closure','{function f_N(window){return ()=>{/*MARK*/ window;};}}'],
  ['block-let-outer','{let window=1; { /*MARK*/ window; }}'],
  ['block-shadow','{let window=1; {let window=2; /*MARK*/ window; }}'],
  ['named-class-method','{class window{method(){/*MARK*/ window;}}}'],
  ['top-lexical-in-block','{let window=0;} /*MARK*/ window;']
];

test('150 source-paired Acorn/TypeScript reference classifications',()=>{
  /** @type {{label:string,expr:string}[]} */
  const cases=[];
  for(let repeat=0;repeat<5;repeat++){
    for(const [label,pattern] of templates){
      const index=cases.length;
      const raw=pattern.replaceAll('_N','_'+index);
      const expr=repeat===0?raw:
        repeat===1?'function outer_'+index+'(){'+raw+'}':
        repeat===2?'(()=>{'+raw+'})();':
        repeat===3?'{const holder_'+index+'=function(window){'+raw+'};}':
        '{let window=0; '+raw+'}';
      cases.push({label,expr});
    }
  }
  const source='export {};\n'+cases.map(item=>item.expr).join('\n');
  const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const proof=resolveLexicalReferences(ast,'module');
  const filename=path.join(process.cwd(),'obfs-binder-reference-virtual.js').replaceAll('\\','/');
  const canonical=(/** @type {string} */ name)=>path.resolve(name).replaceAll('\\','/').toLowerCase();
  const target=canonical(filename);
  const options={
    allowJs:true,
    checkJs:false,
    noEmit:true,
    target:ts.ScriptTarget.ES2022,
    module:ts.ModuleKind.ESNext,
    types:[],
    lib:['lib.es2022.d.ts','lib.dom.d.ts'],
    skipLibCheck:true
  };
  const host=ts.createCompilerHost(options);
  const originalGetSourceFile=host.getSourceFile.bind(host);
  const originalFileExists=host.fileExists.bind(host);
  host.fileExists=name=>canonical(name)===target||originalFileExists(name);
  host.getSourceFile=(name,languageVersion,onError,shouldCreateNewSourceFile)=>
    canonical(name)===target?
      ts.createSourceFile(name,source,languageVersion,true,ts.ScriptKind.JS):
      originalGetSourceFile(name,languageVersion,onError,shouldCreateNewSourceFile);
  const program=ts.createProgram([filename],options,host);
  const checker=program.getTypeChecker();
  const sf=program.getSourceFile(filename);
  assert.ok(sf);
  assert.equal(program.getSyntacticDiagnostics(sf).length,0);
  /** @type {Map<number,import('typescript').Identifier>} */
  const tsIdentifiers=new Map();
  /** @param {import('typescript').Node} node */
  function collect(node){
    if(ts.isIdentifier(node))tsIdentifiers.set(node.getStart(sf),node);
    ts.forEachChild(node,collect);
  }
  collect(sf);
  let after=0;
  for(let i=0;i<cases.length;i++){
    const commentStart=source.indexOf('/*MARK*/',after);
    assert.ok(commentStart>=0);
    const position=commentStart+'/*MARK*/'.length+1;
    after=position;
    const acornRef=proof.at(position);
    const tsRef=tsIdentifiers.get(position);
    assert.ok(acornRef,String(i)+' '+cases[i].label+': missing Acorn reference');
    assert.ok(tsRef,String(i)+' '+cases[i].label+': missing TypeScript reference');
    const declarations=checker.getSymbolAtLocation(tsRef)?.declarations??[];
    /** @type {'local'|'free-host-candidate'} */
    const expected=declarations.some((/** @type {import('typescript').Declaration} */ decl)=>decl.getSourceFile()===sf)?
      'local':'free-host-candidate';
    assert.equal(acornRef.resolution.kind,expected,
      String(i)+' '+cases[i].label+': '+cases[i].expr);
  }
  assert.equal(cases.length,150);
});
