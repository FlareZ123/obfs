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


const fileReadMethods=new Set(['readFile','readFileSync','createReadStream',
  'open','openSync','read','readSync','readv','readvSync']);

/**
 * @param {any} node
 * @returns {string|null}
 */
function getMemberName(node) {
  if(!node||node.type!=='MemberExpression')return null;
  return node.computed?staticString(node.property):
    node.property.type==='Identifier'?node.property.name:null;
}

/**
 * @param {any} node
 * @returns {string|null}
 */
function getRequiredModule(node) {
  if(!node||node.type!=='CallExpression'||node.callee.type!=='Identifier'||
     node.callee.name!=='require'||!node.arguments[0])return null;
  return staticString(node.arguments[0]);
}

/**
 * @param {any} node
 * @param {Set<string>} fsAliases
 * @param {Set<string>} promiseAliases
 * @returns {boolean}
 */
function isFsObject(node,fsAliases,promiseAliases) {
  if(node?.type==='Identifier')return fsAliases.has(node.name)||promiseAliases.has(node.name);
  if(node?.type==='MemberExpression'&&getMemberName(node)==='promises'&&
     node.object.type==='Identifier')return fsAliases.has(node.object.name);
  const source=getRequiredModule(node);
  return Boolean(source&&fileModules.has(source));
}

/**
 * Classify only obvious path provenance; unknown expressions remain unknown.
 * @param {any} node
 * @returns {string}
 */
function classifyFsPath(node) {
  if(!node)return 'missing-path';
  if(node.type==='Literal') {
    if(node.value===0)return 'stdin-fd';
    if(typeof node.value==='string') {
      if(['/dev/stdin','/dev/fd/0','/proc/self/fd/0'].includes(node.value))return 'stdin-path';
      return 'literal-path';
    }
  }
  const literal=staticString(node);
  if(literal!==null) {
    if(['/dev/stdin','/dev/fd/0','/proc/self/fd/0'].includes(literal))return 'stdin-path';
    return 'literal-path';
  }
  if(node.type==='Identifier') {
    if(node.name==='__filename')return 'source-file';
    if(node.name==='__dirname')return 'source-directory';
    return 'dynamic-identifier';
  }
  if(node.type==='MemberExpression') {
    const key=getMemberName(node);
    if(node.object.type==='Identifier'&&node.object.name==='process'&&key==='stdin')return 'process-stdin';
    if(node.object.type==='MemberExpression'&&node.object.object.type==='Identifier'&&
       node.object.object.name==='process'&&getMemberName(node.object)==='argv'&&key==='1') {
      return 'process-argv-script-path';
    }
    if(node.object.type==='MetaProperty'&&key==='url')return 'import-meta-url';
    return 'dynamic-member-path';
  }
  if(node.type==='CallExpression') {
    const method=getMemberName(node.callee);
    if(['join','resolve','normalize'].includes(method??'')) {
      const args=node.arguments.filter(arg=>arg.type!=='SpreadElement');
      if(args.some(arg=>arg.type==='Identifier'&&['__filename','__dirname'].includes(arg.name))) {
        return 'source-derived-composed-path';
      }
      if(args.some(arg=>staticString(arg)==='/dev/stdin'||staticString(arg)==='/dev/fd/0')) {
        return 'stdin-composed-path';
      }
      if(args.every(arg=>staticString(arg)!==null))return 'literal-composed-path';
      return 'dynamic-composed-path';
    }
    if(node.callee.type==='Identifier'&&node.callee.name==='fileURLToPath')return 'file-url-derived-path';
    return 'dynamic-call-path';
  }
  return 'dynamic-or-unknown';
}

/**
 * Bounded static alias and call scan for common fs read APIs. This does not
 * claim complete points-to coverage; it reports observed operations only.
 *
 * @param {import('../src/ast').AstNode} ast
 * @returns {{fsAliases:boolean,methods:Set<string>,paths:Set<string>,calls:number}}
 */
function collectFsReadCalls(ast) {
  const fsAliases=new Set();
  const promiseAliases=new Set();
  const methodAliases=new Map();
  walk(ast,node=>{
    if(node.type==='ImportDeclaration') {
      const source=String(node.source?.value??'');
      if(!fileModules.has(source))return;
      const isPromises=source.includes('promises');
      for(const specifier of node.specifiers) {
        if(specifier.type==='ImportDefaultSpecifier'||specifier.type==='ImportNamespaceSpecifier') {
          (isPromises?promiseAliases:fsAliases).add(specifier.local.name);
        } else if(specifier.type==='ImportSpecifier') {
          const imported=specifier.imported.type==='Identifier'?specifier.imported.name:
            String(specifier.imported.value);
          if(imported==='promises'&&!isPromises)promiseAliases.add(specifier.local.name);
          else if(fileReadMethods.has(imported))methodAliases.set(specifier.local.name,imported);
        }
      }
    }
    if(node.type==='VariableDeclarator') {
      const source=getRequiredModule(node.init);
      if(source&&fileModules.has(source)) {
        const isPromises=source.includes('promises');
        if(node.id.type==='Identifier') {
          (isPromises?promiseAliases:fsAliases).add(node.id.name);
        } else if(node.id.type==='ObjectPattern') {
          for(const property of node.id.properties) {
            if(property.type!=='Property')continue;
            const imported=property.key.type==='Identifier'?property.key.name:
              property.key.type==='Literal'?String(property.key.value):null;
            const local=property.value.type==='Identifier'?property.value.name:null;
            if(!imported||!local)continue;
            if(imported==='promises'&&!isPromises)promiseAliases.add(local);
            else if(fileReadMethods.has(imported))methodAliases.set(local,imported);
          }
        }
      }
      if(node.id.type==='Identifier'&&node.init?.type==='MemberExpression') {
        const method=getMemberName(node.init);
        if(method==='promises'&&node.init.object.type==='Identifier'&&fsAliases.has(node.init.object.name)) {
          promiseAliases.add(node.id.name);
        } else if(fileReadMethods.has(method??'')&&isFsObject(node.init.object,fsAliases,promiseAliases)) {
          methodAliases.set(node.id.name,method);
        }
      }
    }
  });
  const methods=new Set();
  const paths=new Set();
  let calls=0;
  walk(ast,node=>{
    if(node.type!=='CallExpression')return;
    let method=null;
    let moduleObject=false;
    let pathArg=node.arguments[0]??null;
    if(node.callee.type==='MemberExpression') {
      method=getMemberName(node.callee);
      moduleObject=isFsObject(node.callee.object,fsAliases,promiseAliases);
    } else if(node.callee.type==='Identifier'&&methodAliases.has(node.callee.name)) {
      method=methodAliases.get(node.callee.name);
      moduleObject=true;
    }
    if(!moduleObject||!method||!fileReadMethods.has(method))return;
    calls++;
    methods.add(method);
    paths.add(['read','readSync','readv','readvSync'].includes(method)?
      'file-descriptor-read':classifyFsPath(pathArg));
  });
  return {fsAliases:fsAliases.size+promiseAliases.size>0,methods,paths,calls};
}

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
    fsReadDiagnostics:{filesWithFsAliases:0,filesWithRecognizedReadCalls:0,filesWithFsAliasWithoutReadCall:0,readCallFilesByMethod:{},readCallFilesByPathClass:{}},
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
    const fsReads=collectFsReadCalls(ast);
    if(fsReads.fsAliases)result.fsReadDiagnostics.filesWithFsAliases++;
    if(fsReads.calls>0)result.fsReadDiagnostics.filesWithRecognizedReadCalls++;
    else if(fsReads.fsAliases)result.fsReadDiagnostics.filesWithFsAliasWithoutReadCall++;
    for(const method of fsReads.methods)result.fsReadDiagnostics.readCallFilesByMethod[method]=(result.fsReadDiagnostics.readCallFilesByMethod[method]??0)+1;
    for(const pathClass of fsReads.paths)result.fsReadDiagnostics.readCallFilesByPathClass[pathClass]=(result.fsReadDiagnostics.readCallFilesByPathClass[pathClass]??0)+1;
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
