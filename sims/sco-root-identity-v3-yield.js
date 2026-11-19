'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('../src/ast');
const {proveRootIdentityEligibility}=require('./sco-root-identity-static-proof');

const FILES=[
  'examples/application-challenge/sco-before/api.mjs',
  'examples/application-challenge/sco-public/sco-before/api.mjs',
  'examples/sco-graph/before/api.mjs',
  'examples/sco-graph/before/audit.mjs',
  'examples/sco-graph/before/secret.mjs',
  'examples/sco-private-const/before/mixed.mjs',
  'examples/sco-private-env/before/mixed.mjs',
  'examples/sco-private-graph/before/mixed.mjs',
  'examples/sco-private-graph/before/private/engine.mjs',
  'examples/sco-private/before-private.mjs',
  'examples/sco-public-helpers/before/mixed.mjs',
  'examples/sco-selective/before/mixed.mjs',
  'examples/sco-static-imports/before/mixed.mjs'
];

/**
 * @param {string} source
 * @returns {string[]}
 */
function listDirectExportedAsyncNames(source){
  const ast=parse(source,'module');
  /** @type {string[]} */
  const names=[];
  for(const statement of ast.body){
    if(statement.type!=='ExportNamedDeclaration'||statement.source||
       statement.specifiers?.length||!statement.declaration)continue;
    const declaration=statement.declaration;
    if(declaration.type==='FunctionDeclaration'&&declaration.async&&
       !declaration.generator&&declaration.id?.type==='Identifier'){
      names.push(declaration.id.name);
      continue;
    }
    if(declaration.type!=='VariableDeclaration'||declaration.kind!=='const')continue;
    for(const item of declaration.declarations){
      if(item.id.type!=='Identifier'||!item.init)continue;
      if(!['FunctionExpression','ArrowFunctionExpression'].includes(item.init.type))continue;
      if(item.init.async&&!item.init.generator)names.push(item.id.name);
    }
  }
  return names.sort();
}

/** @returns {object} */
function scanYield(){
  /** @type {Array<{path:string,name:string,eligible:boolean,reasons:string[]}>} */
  const functions=[];
  for(const relativePath of FILES){
    const source=fs.readFileSync(path.join(process.cwd(),relativePath),'utf8');
    for(const name of listDirectExportedAsyncNames(source)){
      const proof=proveRootIdentityEligibility(source,name);
      functions.push({
        path:relativePath,
        name,
        eligible:proof.eligible,
        reasons:[...proof.reasons].sort()
      });
    }
  }
  functions.sort((left,right)=>
    left.path.localeCompare(right.path)||left.name.localeCompare(right.name));

  /** @type {Map<string,number>} */
  const reasonCounts=new Map();
  for(const item of functions){
    for(const reason of item.reasons){
      reasonCounts.set(reason,(reasonCounts.get(reason)??0)+1);
    }
  }
  const eligible=functions.filter(item=>item.eligible);
  const refused=functions.filter(item=>!item.eligible);
  const total=functions.length;
  return {
    files:FILES,
    scannedFiles:FILES.length,
    discoveredFunctions:total,
    eligibleCount:eligible.length,
    refusedCount:refused.length,
    eligibleFraction:total===0?0:eligible.length/total,
    refusedFraction:total===0?0:refused.length/total,
    reasonCounts:Object.fromEntries(
      [...reasonCounts.entries()].sort((left,right)=>
        right[1]-left[1]||left[0].localeCompare(right[0]))
    ),
    eligible:eligible.map(item=>({path:item.path,name:item.name})),
    functions
  };
}

if(require.main===module){
  process.stdout.write('SCO_ROOT_IDENTITY_V3_YIELD '+JSON.stringify(scanYield())+'\n');
}

module.exports={FILES,listDirectExportedAsyncNames,scanYield};
