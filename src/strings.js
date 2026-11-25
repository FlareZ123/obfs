'use strict';

const {createHash} = require('node:crypto');
const {walk, applyEdits, observesFunctionSource, sourceSpelledErrorOperand} = require('./ast');
const {collectBindings} = require('./properties');

/** @typedef {import('./ast').AstNode} AstNode */

/**
 * @param {string} source
 * @param {AstNode} ast
 * @param {string} seed
 * @param {Set<string>|undefined} reservedNames
 * @param {string[]|undefined} reservedSources
 * @returns {string}
 */
function unusedName(source, ast, seed, reservedNames, reservedSources) {
  // Escaped Unicode identifiers do not appear verbatim in the source text,
  // but Acorn normalizes their names. Reserve those bindings as well.
  const names = new Set();
  walk(ast, node => {if (node.type === 'Identifier') names.add(node.name);});
  const digest = createHash('sha256').update(seed).digest('hex');
  for (let n = 0; n <= digest.length - 12; n++) {
    const name = `_o${digest.slice(n, n + 12)}`;
    const pattern = new RegExp(`\\b${name}\\b`, 'u');
    if (!names.has(name) && !reservedNames?.has(name) && !pattern.test(source) &&
        !(reservedSources?.some(text => pattern.test(text)))) return name;
  }
  throw new Error('Failed to allocate a collision-free helper name');
}

/**
 * V8 can echo a failed operand's source spelling into TypeError.message.
 * Rewriting any string literal inside the source of that operand would
 * change an observable error even when the decoded string value matches.
 * Follow only enclosing expressions, stopping at a new function body.
 *
 * @param {AstNode} node
 * @param {AstNode[]} ancestors
 * @returns {boolean}
 */
function mayAppearInFailedOperand(node,ancestors) {
  let expression=node;
  for(let i=ancestors.length-1;i>=0;i--){
    const outer=ancestors[i];
    if(sourceSpelledErrorOperand(outer)===expression)return true;
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(outer.type))break;
    expression=outer;
  }
  return false;
}

/**
 * Experimental lazy decoder appended after the original source. Replacements
 * are padded to their original UTF-16 spans so later frame coordinates do not
 * move. Only module/CommonJS scopes are supported; classic scripts would gain
 * a new global function binding.
 * @param {string} source
 * @param {AstNode} ast
 * @param {{seed:string,minimumLength?:number,reservedNames?:Set<string>,reservedSources?:string[]}} options
 * @returns {{code:string,count:number}}
 */
function encodeStringsWithSourceSpans(source,ast,options) {
  const spanObserved=observesFunctionSource(ast);
  const spanStringShadowed=collectBindings(ast).has('String');
  if(ast.sourceType==='script'||spanObserved||spanStringShadowed) {
    console.log('SPANSTR_EARLY',JSON.stringify({sourceType:ast.sourceType,spanObserved,spanStringShadowed}));
    return {code:source,count:0};
  }
  // A direct eval/Function constructor can introduce a binding that shadows
  // the appended helper. With-scope lookup can do the same dynamically.
  let dynamicScope=false;
  walk(ast,node=>{
    if(node.type==='WithStatement')dynamicScope=true;
    if(node.type==='Identifier'&&(node.name==='eval'||node.name==='Function'))dynamicScope=true;
  });
  if(dynamicScope){console.log('SPANSTR_DYNAMIC');return {code:source,count:0};}
  const helper=unusedName(source,ast,options.seed+'span-strings',options.reservedNames,options.reservedSources);
  if(!helper){console.log('SPANSTR_NO_HELPER');return {code:source,count:0};}
  const values=new Map();
  /** @type {{start:number,end:number,text:string}[]} */
  const edits=[];
  const minimumLength=options.minimumLength??4;
  walk(ast,(node,parent,key,ancestors)=>{
    if(node.type!=='Literal'||typeof node.value!=='string'||
       node.value.length<minimumLength||!parent)return;
    if(parent.type==='ExpressionStatement'&&parent.directive)return;
    if((parent.type==='Property'||parent.type==='MethodDefinition'||
        parent.type==='PropertyDefinition')&&key==='key'&&!parent.computed)return;
    if(parent.type==='ImportSpecifier'||parent.type==='ExportSpecifier')return;
    if(/^(ImportDeclaration|ImportExpression|ExportNamedDeclaration|ExportAllDeclaration|ImportAttribute)$/.test(parent.type))return;
    if((parent.type==='CallExpression'||parent.type==='NewExpression')&&key==='arguments'&&
       parent.callee.type==='Identifier'&&['require','eval','Function'].includes(parent.callee.name))return;
    if(ancestors.some(ancestor=>/^(ForStatement|ForInStatement|ForOfStatement|WhileStatement|DoWhileStatement)$/.test(ancestor.type)))return;
    if(mayAppearInFailedOperand(node,ancestors))return;
    const value=/** @type {string} */ (node.value);
    let index=values.get(value);
    if(index===undefined)index=values.size;
    const replacement=helper+'('+index+')';
    const oldText=source.slice(node.start,node.end);
    if(replacement.length>oldText.length)return;
    if(!values.has(value))values.set(value,index);
    edits.push({start:node.start,end:node.end,
      text:replacement+' '.repeat(oldText.length-replacement.length)});
  });
  if(!edits.length){console.log('SPANSTR_NO_EDITS',JSON.stringify({helper,minimumLength,sourceType:ast.sourceType}));return {code:source,count:0};}
  options.reservedNames?.add(helper);
  const key=(parseInt(createHash('sha256').update(options.seed).digest('hex').slice(0,4),16)%65535)+1;
  const encoded=[...values.keys()].map(value=>{
    let data='';
    for(let index=0;index<value.length;index++)
      data+=String.fromCharCode(value.charCodeAt(index)^key);
    return data;
  });
  const decoder='function '+helper+'(i){const t='+helper+'.t||('+helper+'.t='+JSON.stringify(encoded)+');let r=t[i];if(typeof r!=="string")return r.v;let d="";for(let o=0;o<r.length;o+=4096){const u=[];for(let j=o;j<r.length&&j<o+4096;j++)u.push(r.charCodeAt(j)^'+key+');d+=String.fromCharCode(...u);}t[i]={v:d};return d;}\n';
  const transformed=applyEdits(source,edits);
  return {code:transformed+'\n'+decoder,count:edits.length};
}

/**
 * Encode immutable literal strings with one-time runtime decoding.
 * All JS UTF-16 code units are retained, including isolated surrogates.
 * @param {string} source
 * @param {AstNode} ast
 * @param {{seed:string, minimumLength?:number, reservedNames?:Set<string>, reservedSources?:string[], fixedArity?:boolean, experimentalLocalStringSpanPreservation?:boolean}} options
 * @returns {{code:string, count:number}}
 */
function encodeStrings(source, ast, options) {
  if(options.experimentalLocalStringSpanPreservation===true)
    return encodeStringsWithSourceSpans(source,ast,options);
  if(observesFunctionSource(ast)) return {code:source,count:0};
  // The decoder uses the ambient String intrinsic. A file-level or nested
  // lexical binding with this name can shadow it, including before TDZ init.
  if (collectBindings(ast).has('String')) return {code:source,count:0};
  const values = new Map();
  /** @type {{start:number,end:number,text:string}[]} */
  const edits = [];
  const helper = unusedName(source, ast, options.seed + 'strings', options.reservedNames, options.reservedSources);
  const minimumLength = options.minimumLength ?? 4;
  // ESM dependencies evaluate before this module's body. In an import cycle,
  // a dependency can call a hoisted function declaration before the decoder
  // array's top-level initializer executes. Preserve such literals verbatim.
  const hasEagerDependencies = ast.sourceType === 'module' && (/** @type {AstNode[]} */ (ast.body)).some((/** @type {AstNode} */ statement) =>
    statement.type === 'ImportDeclaration' || statement.type === 'ExportAllDeclaration' ||
    statement.type === 'ExportNamedDeclaration' && statement.source);
  // A non-strict with host may expose arbitrary function/class source text
  // through an opaque property getter, even if the source has no direct
  // Function#toString or other recognized observer call. Preserve every
  // such source range; unrelated top-level literal values may still encode.
  let opaqueWithScope=false;
  walk(ast,node=>{if(node.type==='WithStatement')opaqueWithScope=true;});
  const sourceBodies=new Set([
    'FunctionDeclaration','FunctionExpression','ArrowFunctionExpression',
    'ClassDeclaration','ClassExpression'
  ]);
  walk(ast, (node, parent, key, ancestors) => {
    if (node.type !== 'Literal' || typeof node.value !== 'string' ||
        node.value.length < minimumLength || !parent) return;
    if (parent.type === 'ExpressionStatement' && parent.directive) return;
    if (hasEagerDependencies && ancestors.some(ancestor => ancestor.type === 'FunctionDeclaration')) return;
    if (opaqueWithScope && ancestors.some(ancestor => sourceBodies.has(ancestor.type))) return;
    // A non-strict with environment may supply the newly generated helper
    // binding dynamically. Even an otherwise inert string read inside its
    // body can resolve to a hostile property instead of our decoder table.
    if (ancestors.some(ancestor => ancestor.type === 'WithStatement')) return;
    if ((parent.type === 'Property' || parent.type === 'MethodDefinition' ||
         parent.type === 'PropertyDefinition') && key === 'key' && !parent.computed) return;
    // A quoted name in an ESM import/export specifier is a grammar token,
    // not an ordinary expression; replacing it with decoder[index] is invalid.
    if (parent.type === 'ImportSpecifier' || parent.type === 'ExportSpecifier') return;
    if (/^(ImportDeclaration|ImportExpression|ExportNamedDeclaration|ExportAllDeclaration|ImportAttribute)$/.test(parent.type)) return;
    if ((parent.type === 'CallExpression' || parent.type === 'NewExpression') && key === 'arguments' &&
        parent.callee.type === 'Identifier' && ['require', 'eval', 'Function'].includes(parent.callee.name)) return;
    if (ancestors.some(ancestor => /^(ForStatement|ForInStatement|ForOfStatement|WhileStatement|DoWhileStatement)$/.test(ancestor.type))) return;
    if (mayAppearInFailedOperand(node,ancestors)) return;
    const value = /** @type {string} */ (node.value);
    if (!values.has(value)) values.set(value, values.size);
    edits.push({start:node.start,end:node.end,text:`${helper}[${values.get(value)}]`});
  });
  if (!edits.length) return {code:source,count:0};
  options.reservedNames?.add(helper);

  const key = (parseInt(createHash('sha256').update(options.seed).digest('hex').slice(0, 4), 16) % 65535) + 1;
  const encoded = [...values.keys()].map(value => {
    let data = '';
    for (let i = 0; i < value.length; i++) data += String.fromCharCode(value.charCodeAt(i) ^ key);
    return data;
  });
  const i = `${helper}i`;
  const j = `${helper}j`;
  const raw = `${helper}r`;
  const decoded = `${helper}d`;
  const offsetName = `${helper}o`;
  const units = `${helper}u`;
  const originalDecoder = `for(let ${j}=0;${j}<${raw}.length;${j}++)${decoded}+=String.fromCharCode(${raw}.charCodeAt(${j})^${key});`;
  // Chunk long strings into 4096-code-unit spreads to avoid quadratic-looking
  // concatenation costs in fresh V8 contexts. Small literals stay on the
  // shorter decoder path, preserving startup speed and the existing AST shape.
  const useChunks=encoded.some(value=>value.length>=1024);
  const chunkedDecoder = `for(let ${offsetName}=0;${offsetName}<${raw}.length;${offsetName}+=4096){const ${units}=[];for(let ${j}=${offsetName};${j}<${raw}.length&&${j}<${offsetName}+4096;${j}++)${units}[${j}-${offsetName}]=${raw}.charCodeAt(${j})^${key};${decoded}+=String.fromCharCode(...${units});}`;
  // Fixed-arity calls avoid temporary [] writes and spread iteration.
  // Select a shorter helper for a small total payload. 64 direct arguments
  // reduce source size for small programs; 256 amortize call overhead when
  // many large literals share one decoder. This is a measured heuristic, not
  // a universal 2.5x runtime guarantee.
  // The XOR table remains source-only recoverable and is not a secrecy layer.
  let longDecoder=chunkedDecoder;
  if(options.fixedArity&&useChunks) {
    let longUnits=0;
    for(const value of encoded)if(value.length>=1024)longUnits+=value.length;
    const width=longUnits<8192?64:256;
    const args=Array.from({length:width},(_,index)=>
      `${raw}.charCodeAt(${offsetName}+${index})^${key}`).join(',');
    longDecoder=`let ${offsetName}=0;for(;${offsetName}+${width}<=${raw}.length;${offsetName}+=${width})${decoded}+=String.fromCharCode(${args});for(let ${j}=${offsetName};${j}<${raw}.length;${j}++)${decoded}+=String.fromCharCode(${raw}.charCodeAt(${j})^${key});`;
  }
  const decoder=useChunks ? `if(${raw}.length<1024){${originalDecoder}}else{${longDecoder}}` : originalDecoder;
  const init = `const ${helper}=${JSON.stringify(encoded)};for(let ${i}=0;${i}<${helper}.length;${i}++){const ${raw}=${helper}[${i}];let ${decoded}='';${decoder}${helper}[${i}]=${decoded};}\n`;

  // Keep hashbang and directive prologues intact; imports can follow declarations per ESM grammar.
  let offset = 0;
  if (source.startsWith('#!')) {
    const end = source.indexOf('\n');
    offset = end < 0 ? source.length : end + 1;
  }
  for (const statement of ast.body) {
    if (statement.type === 'ExpressionStatement' && statement.directive) offset = statement.end;
    else break;
  }
  const transformed = applyEdits(source, edits);
  // The prefix remains untouched: literal replacements never overlap a directive.
  return {code:transformed.slice(0,offset) + '\n' + init + transformed.slice(offset),count:edits.length};
}

module.exports = {encodeStrings};
