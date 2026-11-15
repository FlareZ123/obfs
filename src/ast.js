'use strict';

const acorn = require('acorn');

/** @type {WeakMap<object,boolean>} */
const sourceObservationCache=new WeakMap();

/**
 * @typedef {{[key:string]:any,type: string, start: number, end: number}} AstNode
 * @typedef {{ start: number, end: number, text: string }} Edit
 */

/**
 * Parse JavaScript without implicit grammar downgrades or error recovery.
 * @param {string} source
 * @param {'script'|'module'|'commonjs'} sourceType
 * @returns {AstNode}
 */
function parse(source, sourceType) {
  return /** @type {AstNode} */ (acorn.parse(source, {
    ecmaVersion: 'latest',
    sourceType: sourceType === 'commonjs' ? 'script' : sourceType,
    allowReturnOutsideFunction: sourceType === 'commonjs',
    allowHashBang: true,
    preserveParens: false
  }));
}

/**
 * Walk all ESTree children; parent and key describe each node's actual AST position.
 * @param {AstNode} root
 * @param {(node:AstNode,parent:AstNode|null,key:string|null,ancestors:AstNode[])=>void} visit
 * @returns {void}
 */
function walk(root, visit) {
  /** @param {AstNode} node @param {AstNode|null} parent @param {string|null} key @param {AstNode[]} ancestors */
  function go(node, parent, key, ancestors) {
    visit(node, parent, key, ancestors);
    const next = [...ancestors, node];
    for (const [childKey, value] of Object.entries(node)) {
      if (childKey === 'parent' || childKey === 'comments') continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && typeof item.type === 'string') {
            go(/** @type {AstNode} */ (item), node, childKey, next);
          }
        }
      } else if (value && typeof value === 'object' && typeof value.type === 'string') {
        go(/** @type {AstNode} */ (value), node, childKey, next);
      }
    }
  }
  go(root, null, null, []);
}

/**
 * Apply edits in descending offset order, rejecting overlaps and out-of-range edits.
 * @param {string} source
 * @param {Edit[]} edits
 * @returns {string}
 */
function applyEdits(source, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let upper = source.length;
  for (const edit of sorted) {
    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end) ||
        edit.start < 0 || edit.end < edit.start || edit.end > upper) {
      throw new RangeError(`Invalid or overlapping edit at ${edit.start}:${edit.end}`);
    }
    upper = edit.start;
  }
  let output = source;
  for (const edit of sorted) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  return output;
}

/**
 * Resolve only bounded constant string spellings used as computed keys.
 * @param {AstNode} node
 * @param {number} [depth]
 * @returns {string|null}
 */
function staticString(node,depth=0){
  if(depth>16)return null;
  if(node.type==='Literal' && typeof node.value==='string')return node.value;
  if(node.type==='TemplateLiteral' && !node.expressions.length){
    const cooked=node.quasis[0]?.value.cooked;
    return typeof cooked==='string' ? cooked : null;
  }
  if(node.type==='BinaryExpression' && node.operator==='+'){
    const left=staticString(node.left,depth+1);
    const right=staticString(node.right,depth+1);
    return left!==null && right!==null ? left+right : null;
  }
  return null;
}

/**
 * Detect common source-observing operations before rewriting AST subtrees.
 * Native Function#toString can expose changed source spelling at runtime.
 * This is a conservative opt-out for known direct operations; arbitrary
 * coercion or reflective indirection still requires a richer proof.
 * @param {AstNode} ast
 * @returns {boolean}
 */
function observesFunctionSource(ast) {
  const cached=sourceObservationCache.get(ast);
  if(cached!==undefined) return cached;
  let observed=false;
  walk(ast,node=>{
    if(node.type==='MemberExpression') {
      const name=node.computed ? staticString(node.property) :
        (node.property.type==='Identifier' ? node.property.name : null);
      if(name==='toString'||name==='toSource') observed=true;
    }
    if(node.type==='CallExpression'||node.type==='NewExpression') {
      const callee=node.callee;
      /** @type {AstNode|null|undefined} */
      let argument=null;
      if(callee.type==='Identifier' && callee.name==='String') argument=node.arguments[0];
      if(callee.type==='MemberExpression') {
        const name=callee.computed ? staticString(callee.property) :
          (callee.property.type==='Identifier' ? callee.property.name : null);
        const receiver=callee.object;
        if(name==='String' && receiver.type==='Identifier' &&
            ['globalThis','window','self','global'].includes(receiver.name)) {
          argument=node.arguments[0];
        } else if(receiver.type==='Identifier' && receiver.name==='String' && node.type==='CallExpression') {
          if(name==='call'||name==='bind') argument=node.arguments[1];
          if(name==='apply') {
            const args=node.arguments[1];
            if(args?.type==='ArrayExpression') argument=args.elements[0];
            else if(args) observed=true;
          }
        }
      }
      // A literal string/number/regex is never a function whose source is
      // exposed through coercion. Keep these common primitives eligible.
      if(argument && argument.type!=='Literal' &&
          !(argument.type==='TemplateLiteral' && argument.expressions.length===0)) observed=true;
    }
  });
  sourceObservationCache.set(ast,observed);
  return observed;
}

module.exports = {parse, walk, applyEdits, observesFunctionSource, staticString};
