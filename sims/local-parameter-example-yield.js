'use strict';

const acorn=require('acorn');
const walk=require('acorn-walk');
const fs=require('node:fs/promises');
const path=require('node:path');

const ROOT=path.resolve(__dirname,'../examples');

/** @typedef {{path:string,ownerLine:number,value:string,key:string,shorthand:boolean}} Candidate */
/** @typedef {{sourceFiles:number,syntaxParameterValues:number,directConstOwners:number,syntaxShorthandParameterValues:number,directConstShorthandOwners:number,candidates:Candidate[]}} Report */

/**
 * Search a tree deterministically. Only source-before/native fixtures count;
 * obfuscator-generated after/ files, builders and test strings are excluded.
 * @param {string} folder
 * @returns {Promise<string[]>}
 */
async function sourceFiles(folder) {
  /** @type {string[]} */
  const result=[];
  const entries=await fs.readdir(folder,{withFileTypes:true});
  for(const item of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
    const name=path.join(folder,item.name);
    if(item.isDirectory())result.push(...await sourceFiles(name));
    else if(item.isFile() && /\.(?:cjs|mjs|js)$/u.test(item.name)){
      const relative=path.relative(ROOT,name).replaceAll(path.sep,'/');
      const segments=relative.split('/');
      const basename=segments[segments.length-1];
      if(segments.includes('before')||segments.includes('native')||
         /^(?:before|original)\.(?:cjs|mjs|js)$/u.test(basename))
        result.push(name);
    }
  }
  return result;
}

/**
 * Find grammar-level opportunities; this is intentionally not a compiler
 * soundness/yield proof. Existing member-use, host and source-observation
 * gates can still decline every returned candidate.
 * @param {string} source
 * @param {'module'|'script'} sourceType
 * @param {string} label
 * @returns {{syntax:number,direct:number,shorthandSyntax:number,shorthandDirect:number,candidates:Candidate[]}}
 */
function analyzeSource(source,sourceType,label) {
  const ast=acorn.parse(source,{ecmaVersion:'latest',
    sourceType,allowReturnOutsideFunction:true,allowHashBang:true,locations:true});
  let syntax=0;
  let direct=0;
  let shorthandSyntax=0;
  let shorthandDirect=0;
  /** @type {Candidate[]} */
  const candidates=[];
  walk.fullAncestor(ast,(node,/** @type {unknown} */ _state,ancestors)=>{
    if(node.type!=='ObjectExpression')return;
    const owner=/** @type {import('acorn').ObjectExpression} */(node);
    const parent=/** @type {import('acorn').VariableDeclarator|undefined} */
      (ancestors[ancestors.length-2]);
    const outer=/** @type {import('acorn').VariableDeclaration|undefined} */
      (ancestors[ancestors.length-3]);
    const directConst=parent?.type==='VariableDeclarator'&&parent.init===owner&&
      parent.id.type==='Identifier'&&outer?.type==='VariableDeclaration'&&
      outer.kind==='const';
    const fn=/** @type {import('acorn').FunctionDeclaration|
      import('acorn').FunctionExpression|import('acorn').ArrowFunctionExpression|undefined} */
      ([...ancestors].reverse().find(item=>
        item.type==='FunctionDeclaration'||item.type==='FunctionExpression'||
        item.type==='ArrowFunctionExpression'));
    if(!fn)return;
    for(const property of owner.properties){
      if(property.type!=='Property'||property.kind!=='init'||property.computed||
         property.value.type!=='Identifier')continue;
      if(!fn.params.some(param=>param.type==='Identifier'&&
          param.name===property.value.name))continue;
      syntax++;
      if(property.shorthand)shorthandSyntax++;
      if(!directConst)continue;
      direct++;
      if(property.shorthand)shorthandDirect++;
      candidates.push({path:label,ownerLine:property.loc?.start.line??0,
        value:property.value.name,shorthand:property.shorthand,
        key:property.key.type==='Identifier'?property.key.name:
          String(/** @type {import('acorn').Literal} */(property.key).value)});
    }
  });
  return {syntax,direct,shorthandSyntax,shorthandDirect,candidates};
}

/** @returns {Promise<Report>} */
async function main() {
  const files=await sourceFiles(ROOT);
  /** @type {Report} */
  const report={sourceFiles:files.length,syntaxParameterValues:0,
    directConstOwners:0,syntaxShorthandParameterValues:0,directConstShorthandOwners:0,
    candidates:[]};
  for(const filename of files){
    const source=await fs.readFile(filename,'utf8');
    const analysis=analyzeSource(source,filename.endsWith('.mjs')?'module':'script',
      path.relative(ROOT,filename).replaceAll(path.sep,'/'));
    report.syntaxParameterValues+=analysis.syntax;
    report.directConstOwners+=analysis.direct;
    report.syntaxShorthandParameterValues+=analysis.shorthandSyntax;
    report.directConstShorthandOwners+=analysis.shorthandDirect;
    report.candidates.push(...analysis.candidates);
  }
  process.stdout.write('LOCAL_PARAMETER_VALUE_EXAMPLE_YIELD '+JSON.stringify(report)+'\n');
  return report;
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={analyzeSource,main};
