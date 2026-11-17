'use strict';

const acorn=require('acorn');
const {performance}=require('node:perf_hooks');

const targets=Object.freeze(['round1','round2','round3']);

/**
 * A generic, syntax-only comparison attacker for conventional minified ESM.
 * The inputs are only delivered text bytes and advertised public export
 * names. It never loads the original application or its obfuscator.
 *
 * @typedef {{name:string,local:string,source:string}} RecoveredFunction
 */

/**
 * @param {string} source
 * @returns {{functions:RecoveredFunction[],recovered:number,attackMs:number,bytes:number}}
 */
function recoverMinifiedPublicMath(source){
  const start=performance.now();
  const ast=/** @type {import('../src/ast').AstNode} */ (acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'}));
  /** @type {Map<string,import('../src/ast').AstNode>} */
  const functions=new Map();
  /** @type {Map<string,string>} */
  const exports=new Map();
  for(const statement of ast.body){
    const declaration=statement.type==='ExportNamedDeclaration'?
      statement.declaration:statement;
    if(declaration?.type==='FunctionDeclaration'&&declaration.id){
      functions.set(declaration.id.name,declaration);
      if(statement.type==='ExportNamedDeclaration')
        exports.set(declaration.id.name,declaration.id.name);
    }
    if(declaration?.type==='VariableDeclaration'){
      for(const item of declaration.declarations){
        if(item.id.type!=='Identifier'||!item.init||
           !['FunctionExpression','ArrowFunctionExpression'].includes(item.init.type))
          continue;
        functions.set(item.id.name,item.init);
        if(statement.type==='ExportNamedDeclaration')
          exports.set(item.id.name,item.id.name);
      }
    }
    if(statement.type==='ExportNamedDeclaration'&&!statement.source){
      for(const specifier of statement.specifiers){
        if(specifier.type!=='ExportSpecifier')continue;
        const local=specifier.local.name??specifier.local.value;
        const exposed=specifier.exported.name??specifier.exported.value;
        if(typeof local==='string'&&typeof exposed==='string')
          exports.set(exposed,local);
      }
    }
  }
  const recovered=targets.map(name=>{
    const local=exports.get(name);
    const expression=local===undefined?undefined:functions.get(local);
    if(!local||!expression)
      throw new Error('Unavailable static function export '+name);
    return {name,local,source:source.slice(expression.start,expression.end)};
  });
  return {functions:recovered,recovered:recovered.length,
    attackMs:performance.now()-start,bytes:Buffer.byteLength(source)};
}

if(require.main===module){
  const fs=require('node:fs');
  const path=require('node:path');
  const filename=process.argv[2];
  if(!filename)throw new TypeError('Expected minified math.mjs source file');
  const result=recoverMinifiedPublicMath(fs.readFileSync(path.resolve(filename),'utf8'));
  process.stdout.write('MINIFIED_PUBLIC_STATIC_RECOVERY '+JSON.stringify(result)+'\n');
}

module.exports={recoverMinifiedPublicMath};
