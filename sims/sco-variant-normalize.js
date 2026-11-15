'use strict';

const {parse,walk,applyEdits}=require('../src/ast');
const {neutralizeHashedNames}=require('./offline-normalize');

/**
 * A source-only reconstruction attack on the current SCO variant format.
 * Removes its public nonce comment, maps predictable mangled identifier and
 * property spelling to stable labels, and prints string literal AST values in
 * canonical JSON form. It never executes the target code.
 *
 * This normalizes a supported family of emitted variants, not arbitrary JS.
 * @param {string} servedCode
 * @param {'script'|'module'|'commonjs'} [sourceType]
 * @returns {string}
 */
function normalizeScoVariant(servedCode,sourceType='script') {
  if(typeof servedCode!=='string')throw new TypeError('Expected a served JS string');
  const marker=/\n\/\* variant:[0-9a-f]{48} \*\/$/u;
  if(!marker.test(servedCode))throw new TypeError('Expected SCO variant marker');
  const stripped=servedCode.replace(marker,'');
  const converted=neutralizeHashedNames([
    {path:sourceType==='module'?'entry.mjs':sourceType==='commonjs'?'entry.cjs':'entry.js',
      code:stripped,sourceType}
  ]).files[0].code;
  const ast=parse(converted,sourceType);
  /** @type {import('../src/ast').Edit[]} */
  const edits=[];
  walk(ast,node=>{
    if(node.type==='Literal'&&typeof node.value==='string') {
      edits.push({start:node.start,end:node.end,text:JSON.stringify(node.value)});
    }
  });
  return applyEdits(converted,edits);
}

module.exports={normalizeScoVariant};
