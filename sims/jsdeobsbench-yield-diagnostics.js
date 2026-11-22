'use strict';

const fs = require('node:fs/promises');
const {parse,walk,staticString,observesFunctionSource,observesDistributedSource} = require('../src/ast');

/** @typedef {'script'|'commonjs'} SourceType */
/**
 * @typedef {{
 *   filename?:string,
 *   original:string,
 *   obfs_metrics:{bindings:number}
 * }} BenchmarkRow
 */

const fileModules=new Set(['fs','fs/promises','node:fs','node:fs/promises']);
const loaderModules=new Set(['module','node:module','vm','node:vm',
  'inspector','node:inspector','node:inspector/promises']);
const browserReaders=new Set(['fetch','XMLHttpRequest','FileReader','FileReaderSync',
  'caches','CacheStorage','frames','contentDocument','contentWindow',
  'PerformanceObserver','PerformanceResourceTiming','getEntries','getEntriesByType',
  'getEntriesByName','decodedBodySize','encodedBodySize','transferSize']);
const globalRoots=new Set(['globalThis','window','self','global']);

/**
 * Count broad syntactic source-observation surfaces that appear in the current
 * distributed-source gate. Categories intentionally overlap and are
 * diagnostic indicators, not a proof that a particular branch caused a
 * refusal. In particular, importing fs is not the same as reading this file.
 *
 * @param {import('../src/ast').AstNode} ast
 * @returns {Set<string>}
 */
function collectDistributedReasons(ast) {
  const reasons=new Set();
  walk(ast,node=>{
    if(node.type==='ImportDeclaration') {
      const source=String(node.source?.value??'');
      if(fileModules.has(source))reasons.add('file-module-import');
      if(loaderModules.has(source))reasons.add('loader-module-import');
      if(['process','node:process'].includes(source))reasons.add('process-module-import');
    }
    if(node.type==='ImportExpression') {
      const source=staticString(node.source);
      if(source===null)reasons.add('dynamic-import');
      else if(fileModules.has(source))reasons.add('file-module-import');
      else if(loaderModules.has(source))reasons.add('loader-module-import');
      else if(['process','node:process'].includes(source))reasons.add('process-module-import');
    }
    if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&
       node.callee.name==='require'&&node.arguments[0]) {
      const source=staticString(node.arguments[0]);
      if(source===null)reasons.add('dynamic-require');
      else if(fileModules.has(source))reasons.add('file-module-require');
      else if(loaderModules.has(source))reasons.add('loader-module-require');
      else if(['process','node:process'].includes(source))reasons.add('process-module-require');
    }
    if(node.type==='VariableDeclarator'&&node.init?.type==='Identifier'&&
       node.init.name==='require')reasons.add('require-alias');
    if(node.type==='Identifier'&&browserReaders.has(node.name)) {
      reasons.add('browser-reader-identifier');
    }
    if(node.type==='MemberExpression') {
      const key=node.computed?staticString(node.property):
        node.property.type==='Identifier'?node.property.name:null;
      if(key===null&&node.computed&&node.object.type==='Identifier'&&
         globalRoots.has(node.object.name))reasons.add('dynamic-global-computed-property');
      if(['getBuiltinModule','createRequire','require'].includes(key??'')) {
        reasons.add('loader-member-name');
      }
      if(node.object.type==='Identifier'&&node.object.name==='process'&&
         ['mainModule','binding','_linkedBinding','dlopen','getBuiltinModule'].includes(key??'')) {
        reasons.add('process-loader-member');
      }
    }
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&
       node.callee.object.type==='Identifier'&&
       ['Reflect','Object'].includes(node.callee.object.name)) {
      const method=node.callee.computed?staticString(node.callee.property):
        node.callee.property.type==='Identifier'?node.callee.property.name:null;
      if(['get','getOwnPropertyDescriptor','getOwnPropertyDescriptors','keys',
          'values','entries','ownKeys'].includes(method??'')) {
        reasons.add('native-reflection-access');
      }
    }
  });
  return reasons;
}

/**
 * Count the two whole-file refusal gates that can prevent identifier renaming
 * in the single-file JsDeObsBench adapter. This is diagnostic only: it parses
 * source but never executes benchmark programs or changes compiler behavior.
 *
 * @param {BenchmarkRow[]} rows
 * @param {SourceType} sourceType
 * @returns {object}
 */
function analyzeRows(rows,sourceType) {
  if(!['script','commonjs'].includes(sourceType)) {
    throw new TypeError('sourceType must be script or commonjs');
  }
  const result={
    sourceType,
    files:0,
    parseFailures:0,
    functionSourceObserved:0,
    distributedSourceObserved:0,
    bothObserved:0,
    neitherObserved:0,
    withBindingRewrites:0,
    totalBindingRewrites:0,
    observerFilesWithBindings:0,
    observerFilesWithoutBindings:0,
    unobservedFilesWithBindings:0,
    unobservedFilesWithoutBindings:0,
    distributedReasonFiles:{},
    samples:{
      functionOnly:[],
      distributedOnly:[],
      both:[],
      observedWithBindings:[],
      unobservedWithoutBindings:[],
      parseFailures:[],
      distributedReasons:{}
    }
  };
  for(let index=0;index<rows.length;index++) {
    const row=rows[index];
    if(!row||typeof row.original!=='string'||
       !row.obfs_metrics||!Number.isSafeInteger(row.obfs_metrics.bindings)||
       row.obfs_metrics.bindings<0) {
      throw new TypeError('Invalid benchmark row at index '+index);
    }
    result.files++;
    const filename=typeof row.filename==='string'?row.filename:'<row-'+index+'>';
    let ast;
    try {
      ast=parse(row.original,sourceType);
    } catch(error) {
      result.parseFailures++;
      if(result.samples.parseFailures.length<8) {
        result.samples.parseFailures.push({
          filename,
          error:error instanceof Error?error.message:String(error)
        });
      }
      continue;
    }
    const functionObserved=observesFunctionSource(ast);
    const distributedObserved=observesDistributedSource(ast);
    const reasons=collectDistributedReasons(ast);
    const observed=functionObserved||distributedObserved;
    const bindings=row.obfs_metrics.bindings;
    if(functionObserved)result.functionSourceObserved++;
    if(distributedObserved)result.distributedSourceObserved++;
    if(functionObserved&&distributedObserved)result.bothObserved++;
    if(!observed)result.neitherObserved++;
    if(bindings>0) {
      result.withBindingRewrites++;
      result.totalBindingRewrites+=bindings;
    }
    if(observed&&bindings>0) {
      result.observerFilesWithBindings++;
      if(result.samples.observedWithBindings.length<8) {
        result.samples.observedWithBindings.push(filename);
      }
    } else if(observed) {
      result.observerFilesWithoutBindings++;
    } else if(bindings>0) {
      result.unobservedFilesWithBindings++;
    } else {
      result.unobservedFilesWithoutBindings++;
      if(result.samples.unobservedWithoutBindings.length<8) {
        result.samples.unobservedWithoutBindings.push(filename);
      }
    }
    if(functionObserved&&!distributedObserved&&result.samples.functionOnly.length<8) {
      result.samples.functionOnly.push(filename);
    }
    if(distributedObserved&&!functionObserved&&result.samples.distributedOnly.length<8) {
      result.samples.distributedOnly.push(filename);
    }
    if(functionObserved&&distributedObserved&&result.samples.both.length<8) {
      result.samples.both.push(filename);
    }
    for(const reason of reasons) {
      result.distributedReasonFiles[reason]=(result.distributedReasonFiles[reason]??0)+1;
      const samples=result.samples.distributedReasons[reason]??=[];
      if(samples.length<8)samples.push(filename);
    }
  }
  return result;
}

/**
 * @param {string} jsonlPath
 * @param {SourceType} sourceType
 * @returns {Promise<object>}
 */
async function analyzeJsonl(jsonlPath,sourceType) {
  const rows=(await fs.readFile(jsonlPath,'utf8')).split(/\r?\n/u)
    .filter(Boolean).map(line=>/** @type {BenchmarkRow} */ (JSON.parse(line)));
  return analyzeRows(rows,sourceType);
}

if(require.main===module) {
  const args=process.argv.slice(2);
  if(args.length!==2||!['script','commonjs'].includes(args[1])) {
    throw new TypeError('Required: benchmark JSONL path script|commonjs');
  }
  analyzeJsonl(args[0],/** @type {SourceType} */ (args[1])).then(result=>{
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(result.parseFailures>0)process.exitCode=1;
  }).catch(error=>{
    process.stderr.write(String(error?.stack??error)+'\n');
    process.exitCode=1;
  });
}

module.exports={analyzeRows,analyzeJsonl,collectDistributedReasons};
