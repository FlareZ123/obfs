'use strict';

const acorn = require('acorn');

/** @param {any} node @returns {any} */
function unwrapInt32(node) {
  if (node && node.type === 'BinaryExpression' && node.operator === '|') {
    if (node.right && node.right.type === 'Literal' && node.right.value === 0) return node.left;
    if (node.left && node.left.type === 'Literal' && node.left.value === 0) return node.right;
  }
  return node;
}

/** @param {any} node @returns {number|null} */
function integerLiteral(node) {
  return node && node.type === 'Literal' && Number.isInteger(node.value) ? Number(node.value) : null;
}

/** @param {any} node @param {string} name @returns {boolean} */
function isIdentifier(node, name) {
  return Boolean(node && node.type === 'Identifier' && node.name === name);
}

/**
 * @param {any} node
 * @param {string} name
 * @param {string} operator
 * @param {number} distance
 * @returns {boolean}
 */
function isShift(node, name, operator, distance) {
  return Boolean(node && node.type === 'BinaryExpression' && node.operator === operator &&
    isIdentifier(node.left, name) && integerLiteral(node.right) === distance);
}

/** @param {any} node @param {string} left @param {string} right @param {string} operator @returns {boolean} */
function isCommutativePair(node, left, right, operator) {
  if (!node || node.type !== 'BinaryExpression' || node.operator !== operator) return false;
  return (isIdentifier(node.left, left) && isIdentifier(node.right, right)) ||
    (isIdentifier(node.left, right) && isIdentifier(node.right, left));
}

/** @param {any} fn @returns {{leftShift:number,rightShift:number}|null} */
function classifyRotate(fn) {
  if (!fn || fn.type !== 'FunctionDeclaration' || fn.params.length !== 1 ||
      fn.params[0].type !== 'Identifier' || fn.body.body.length !== 1 ||
      fn.body.body[0].type !== 'ReturnStatement') return null;
  const param = fn.params[0].name;
  const expression = unwrapInt32(fn.body.body[0].argument);
  if (!expression || expression.type !== 'BinaryExpression' || expression.operator !== '|') return null;
  const candidates = [[expression.left, expression.right], [expression.right, expression.left]];
  for (const [left, right] of candidates) {
    if (!left || !right || left.type !== 'BinaryExpression' || right.type !== 'BinaryExpression') continue;
    if (left.operator !== '<<' || right.operator !== '>>>') continue;
    if (!isIdentifier(left.left, param) || !isIdentifier(right.left, param)) continue;
    const leftShift = integerLiteral(left.right);
    const rightShift = integerLiteral(right.right);
    if (leftShift !== null && rightShift !== null && leftShift >= 1 && rightShift >= 1 &&
        leftShift + rightShift === 32) return {leftShift, rightShift};
  }
  return null;
}

/** @param {any} statement @returns {{name:string,init:any}|null} */
function singleDeclaration(statement) {
  if (!statement || statement.type !== 'VariableDeclaration' || statement.declarations.length !== 1) return null;
  const declaration = statement.declarations[0];
  if (!declaration || declaration.id.type !== 'Identifier' || !declaration.init) return null;
  return {name: declaration.id.name, init: declaration.init};
}

/** @param {any} fn @param {number} rotation @returns {boolean} */
function isPackedRotatedAdd(fn, rotation) {
  if (!fn || fn.type !== 'FunctionDeclaration' || fn.params.length !== 2 ||
      fn.params.some(param => param.type !== 'Identifier') || fn.body.body.length !== 6) return false;
  const left = fn.params[0].name;
  const right = fn.params[1].name;
  const declarations = fn.body.body.slice(0, 5).map(singleDeclaration);
  if (declarations.some(item => item === null) || fn.body.body[5].type !== 'ReturnStatement') return false;
  const [sum, high, carry, upper, lower] = declarations;
  if (!sum || !high || !carry || !upper || !lower) return false;

  const sumExpression = unwrapInt32(sum.init);
  if (!isCommutativePair(sumExpression, left, right, '+')) return false;

  const highExpression = unwrapInt32(high.init);
  if (!highExpression || highExpression.type !== 'BinaryExpression' || highExpression.operator !== '+') return false;
  const highPairs = [[highExpression.left, highExpression.right], [highExpression.right, highExpression.left]];
  if (!highPairs.some(([a, b]) => isShift(a, left, '>>>', rotation) &&
      isShift(b, right, '>>>', rotation))) return false;

  const back = 32 - rotation;
  if (!isShift(carry.init, high.name, '>>>', back)) return false;
  if (!isShift(upper.init, high.name, '<<', rotation)) return false;

  const lowerExpression = lower.init;
  if (!lowerExpression || lowerExpression.type !== 'BinaryExpression' || lowerExpression.operator !== '&' ||
      integerLiteral(lowerExpression.right) !== (2 ** rotation - 1)) return false;
  if (!isCommutativePair(unwrapInt32(lowerExpression.left), sum.name, carry.name, '+')) return false;

  const result = unwrapInt32(fn.body.body[5].argument);
  return isCommutativePair(result, upper.name, lower.name, '|');
}

/** @param {any} node @returns {string|null} */
function directCallName(node) {
  const expression = unwrapInt32(node);
  return expression && expression.type === 'CallExpression' && expression.callee.type === 'Identifier'
    ? expression.callee.name : null;
}

/** @param {any} node @param {string} name @returns {number} */
function countCalls(node, name) {
  if (!node || typeof node !== 'object') return 0;
  let count = node.type === 'CallExpression' && node.callee && node.callee.type === 'Identifier' &&
    node.callee.name === name ? 1 : 0;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end') continue;
    if (Array.isArray(value)) {
      for (const item of value) count += countCalls(item, name);
    } else if (value && typeof value === 'object') {
      count += countCalls(value, name);
    }
  }
  return count;
}

/**
 * Recover the fixed public coordinate-region fixture from source without
 * executing the protected source.
 *
 * @param {string} source
 * @returns {{rotation:number,recoveredSource:string}}
 */
function recoverRotatedCoreSource(source) {
  /** @type {any} */
  const program = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'script'});
  const functions = program.body.filter(node => node.type === 'FunctionDeclaration');
  const target = functions.find(fn => fn.params.length === 4);
  if (!target || !target.id || target.params.some(param => param.type !== 'Identifier')) {
    throw new Error('rotated-core target function not found');
  }

  const rotators = functions.map(fn => ({fn, shape: classifyRotate(fn)})).filter(item => item.shape);
  if (rotators.length !== 2) throw new Error('rotation helper pair not found');
  const forward = rotators.slice().sort((a, b) =>
    countCalls(target.body, b.fn.id.name) - countCalls(target.body, a.fn.id.name))[0];
  const inverse = rotators.find(item => item !== forward);
  if (!inverse || !forward.shape || !inverse.shape) throw new Error('inverse rotation helper not found');
  const rotation = forward.shape.leftShift;
  if (inverse.shape.leftShift !== 32 - rotation || inverse.shape.rightShift !== rotation) {
    throw new Error('rotation helpers are not inverse coordinates');
  }
  if (countCalls(target.body, forward.fn.id.name) < 4 ||
      countCalls(target.body, inverse.fn.id.name) !== 1) {
    throw new Error('unexpected coordinate boundary usage');
  }

  const add = functions.find(fn => fn.params.length === 2 && isPackedRotatedAdd(fn, rotation));
  if (!add || !add.id || countCalls(target.body, add.id.name) !== 2) {
    throw new Error('packed rotated-add helper not found');
  }

  const returnStatement = target.body.body.find(statement => statement.type === 'ReturnStatement');
  if (!returnStatement || directCallName(returnStatement.argument) !== inverse.fn.id.name) {
    throw new Error('coordinate exit is not the inverse rotation');
  }

  const [x, y, z, t] = target.params.map(param => param.name);
  const recoveredSource = 'function recovered(' + [x, y, z, t].join(',') + '){' +
    'const left=(((((' + x + '^' + t + ')+' + y + ')|0)+(' + z + '&' + t + '))|0);' +
    'const right=(((' + x + '+' + z + ')|0)|' + y + ');return (left^right)|0;}';
  return {rotation, recoveredSource};
}

module.exports = {recoverRotatedCoreSource};
