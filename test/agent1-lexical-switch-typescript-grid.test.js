'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const ts=require('typescript');
const acorn=require('acorn');
const path=require('node:path');
const {resolveLexicalReferences}=
  require('../workplace/agent1-lexical-reference-resolver');

/**
 * Source-paired independent TypeScript checker oracle for switch discriminant
 * and CaseBlock boundaries. A correct syntactic binding classifier is a
 * necessary condition for a host-root renamer, never proof of native host
 * identity or whole-program source equivalence.
 *
 * @typedef {[string,string]} Pattern
 */

/** @type {Pattern[]} */
const templates=[
  ['discriminant-case-let','switch(/*MARK*/ window){case 1:let window=1;break;}'],
  ['discriminant-arrow-case-let','switch((()=>/*MARK*/ window)()){case 1:let window=1;break;}'],
  ['discriminant-case-class','switch(/*MARK*/ window){case 1:class window{};break;}'],
  ['discriminant-case-function','switch(/*MARK*/ window){case 1:function window(){};break;}'],
  ['discriminant-case-var','switch(/*MARK*/ window){case 1:var window=2;break;}'],
  ['case-test-case-let','switch(1){case /*MARK*/ window:let window=2;break;}'],
  ['case-test-case-class','switch(1){case /*MARK*/ window:class window{};break;}'],
  ['case-test-nested-block-let','switch(1){case /*MARK*/ window:{let window=2;break;}}'],
  ['consequent-case-let','switch(1){case 1:let window=2; /*MARK*/ window;break;}'],
  ['consequent-inner-block-let','switch(1){case 1:{let window=2; /*MARK*/ window;}break;}'],
  ['consequent-after-inner-block','switch(1){case 1:{let window=2;} /*MARK*/ window;break;}'],
  ['consequent-case-var','switch(1){case 1:var window=2; /*MARK*/ window;break;}']
];

/** @type {((body:string,index:number)=>string)[]} */
const wrappers=[
  (body,index)=>'function holder_'+index+'(){'+body+'}',
  (body,index)=>'function holder_'+index+'(window){'+body+'}',
  (body,index)=>'function holder_'+index+'(){let window=3;function nested_'+index+'(){'+body+'}nested_'+index+'();}',
  (body,index)=>'function holder_'+index+'(){(()=>{'+body+'})();}',
  (body,index)=>'function holder_'+index+'(){function inner_'+index+
    '(){'+body+'}inner_'+index+'();}'
];

test('60 source-paired TypeScript switch discriminant / CaseBlock references',()=>{
  /** @type {{label:string,body:string}[]} */
  const cases=[];
  for(const wrap of wrappers)for(const [name,template] of templates){
    const index=cases.length;
    cases.push({label:name,body:wrap(template,index)});
  }
  const source='export {};\n'+cases.map(c=>c.body).join('\n');
  const acornAst=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const resolved=resolveLexicalReferences(acornAst,'module');
  const filename=path.join(process.cwd(),'obfs-switch-binder-virtual.js').replaceAll('\\','/');
  const normalize=(/** @type {string} */ name)=>
    path.resolve(name).replaceAll('\\','/').toLowerCase();
  const target=normalize(filename);
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
  const oldSourceFile=host.getSourceFile.bind(host);
  const oldFileExists=host.fileExists.bind(host);
  host.fileExists=name=>normalize(name)===target||oldFileExists(name);
  host.getSourceFile=(name,version,onError,renew)=>
    normalize(name)===target?
      ts.createSourceFile(name,source,version,true,ts.ScriptKind.JS):
      oldSourceFile(name,version,onError,renew);
  const program=ts.createProgram([filename],options,host);
  const checker=program.getTypeChecker();
  const sf=program.getSourceFile(filename);
  assert.ok(sf);
  assert.equal(program.getSyntacticDiagnostics(sf).length,0);
  /** @type {Map<number,import('typescript').Identifier>} */
  const tsNames=new Map();
  /** @param {import('typescript').Node} node */
  function collect(node){
    if(ts.isIdentifier(node))tsNames.set(node.getStart(sf),node);
    ts.forEachChild(node,collect);
  }
  collect(sf);
  let cursor=0;
  let local=0,hostCandidate=0;
  for(let i=0;i<cases.length;i++){
    const mark=source.indexOf('/*MARK*/',cursor);
    assert.ok(mark>=0,cases[i].label);
    const position=mark+'/*MARK*/'.length+1;
    cursor=position;
    const ref=resolved.at(position);
    const name=tsNames.get(position);
    assert.ok(ref&&ref.name==='window',cases[i].label+': missing Acorn ref');
    assert.ok(name,cases[i].label+': missing TypeScript identifier');
    const declarations=checker.getSymbolAtLocation(name)?.declarations??[];
    /** @type {'local'|'free-host-candidate'} */
    const expected=declarations.some((/** @type {import('typescript').Declaration} */ declaration)=>
      declaration.getSourceFile()===sf)?'local':'free-host-candidate';
    assert.equal(ref.resolution.kind,expected,
      cases[i].label+': '+cases[i].body);
    if(expected==='local')local++;
    else hostCandidate++;
  }
  assert.equal(cases.length,60);
  assert.ok(local>10 && hostCandidate>10,
    'Both local and ambient-like cases must be exercised');
});
