'use strict';

const {parse} = require('../src/ast');

/** @typedef {import('../src/ast').AstNode} AstNode */
/** @typedef {{bytes:Buffer,exportName:string,params:string[]}} LoweredKernel */

/**
 * Experimental offline compiler for a *strictly typed* JavaScript subset.
 *
 * It is intentionally not a general JS->Wasm transformation. The caller must
 * establish that every input is already a primitive Number and that
 * Function#toString / original source spellings are not observed. JavaScript
 * plus over strings, BigInt, objects, proxies, and implicit coercion requires
 * its original semantics and is deliberately excluded.
 *
 * Binaryen is an optional research dependency installed only by the dedicated
 * manual experiment workflow. The emitted binary has no Binaryen runtime
 * dependency, and executes through standard Node and browser WebAssembly.
 *
 * @param {string} source
 * @returns {Promise<LoweredKernel>}
 */
async function lowerF64Expression(source) {
  const ast = parse(source, 'script');
  const statement = ast.body[0];
  if (ast.body.length !== 1 || statement?.type !== 'FunctionDeclaration' ||
      statement.id?.type !== 'Identifier' || statement.async || statement.generator ||
      statement.params.length < 1 ||
      statement.params.length > 8 ||
      statement.body.body.length !== 1 ||
      statement.body.body[0].type !== 'ReturnStatement' ||
      !statement.body.body[0].argument) {
    throw new TypeError('Wasm candidate requires one plain function declaration returning a numeric expression');
  }
  /** @type {string[]} */
  const names=[];
  for (const param of statement.params) {
    if (param.type !== 'Identifier' || names.includes(param.name)) {
      throw new TypeError('Wasm candidate requires distinct identifier parameters');
    }
    names.push(param.name);
  }
  const binaryen = (await import('binaryen')).default;
  const module = new binaryen.Module();
  try {
    /** @param {AstNode} node @returns {number} */
    function lower(node) {
      if (node.type === 'Literal' && typeof node.value === 'number') {
        return module.f64.const(node.value);
      }
      if (node.type === 'Identifier') {
        const position=names.indexOf(node.name);
        if(position < 0) throw new TypeError('Unbound identifier in numeric expression: '+node.name);
        return module.local.get(position,binaryen.f64);
      }
      if (node.type === 'UnaryExpression' &&
          node.operator === '-' && node.prefix) {
        return module.f64.neg(lower(node.argument));
      }
      if (node.type === 'BinaryExpression') {
        const lhs=lower(node.left);
        const rhs=lower(node.right);
        switch (node.operator) {
          case '+':return module.f64.add(lhs,rhs);
          case '-':return module.f64.sub(lhs,rhs);
          case '*':return module.f64.mul(lhs,rhs);
          case '/':return module.f64.div(lhs,rhs);
          default:break;
        }
      }
      throw new TypeError('Unsupported JS construct in numeric Wasm candidate: '+node.type);
    }
    const body=lower(statement.body.body[0].argument);
    module.addFunction(statement.id.name,
      binaryen.createType(names.map(()=>binaryen.f64)),
      binaryen.f64,[],body);
    module.addFunctionExport(statement.id.name,statement.id.name);
    if(!module.validate())throw new Error('Binaryen emitted invalid WebAssembly');
    return {bytes:Buffer.from(module.emitBinary()),
      exportName:statement.id.name,params:names};
  } finally {
    module.dispose();
  }
}

/**
 * An independent attacker needs only the public binary and native Wasm API
 * to obtain a byte-for-byte executable clone. The attacker does not receive
 * the original JavaScript source or any compiler secret.
 * @param {Uint8Array} bytes
 * @param {string} exportName
 * @returns {Function}
 */
function cloneWasmExport(bytes,exportName) {
  const module=new WebAssembly.Module(bytes);
  const instance=new WebAssembly.Instance(module);
  const exported=instance.exports[exportName];
  if(typeof exported!=='function')throw new TypeError('Missing export '+exportName);
  return exported;
}

module.exports={lowerF64Expression,cloneWasmExport};
