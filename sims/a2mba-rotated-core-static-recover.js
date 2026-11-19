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
      fn.body.body.length !== 6) return false;
  for (const param of fn.params) {
    if (param.type !== 'Identifier') return false;
  }
  const left = fn.params[0].name;
  const right = fn.params[1].name;
  /** @type {Array<{name:string,init:any}|null>} */
  const declarations = [];
  for (const statement of fn.body.body.slice(0, 5)) {
    declarations.push(singleDeclaration(statement));
  }
  for (const declaration of declarations) {
    if (declaration === null) return false;
  }
  if (fn.body.body[5].type !== 'ReturnStatement') return false;
  const [sum, high, carry, upper, lower] = declarations;
  if (!sum || !high || !carry || !upper || !lower) return false;

  const sumExpression = unwrapInt32(sum.init);
  if (!isCommutativePair(sumExpression, left, right, '+')) return false;

  const highExpression = unwrapInt32(high.init);
  if (!highExpression || highExpression.type !== 'BinaryExpression' || highExpression.operator !== '+') return false;
  const highMatches =
    (isShift(highExpression.left, left, '>>>', rotation) &&
      isShift(highExpression.right, right, '>>>', rotation)) ||
    (isShift(highExpression.right, left, '>>>', rotation) &&
      isShift(highExpression.left, right, '>>>', rotation));
  if (!highMatches) return false;

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
  /** @type {any[]} */
  const functions = [];
  for (const node of program.body) {
    if (node.type === 'FunctionDeclaration') functions.push(node);
  }
  let target = null;
  for (const fn of functions) {
    if (fn.params.length === 4) {
      target = fn;
      break;
    }
  }
  if (!target || !target.id) throw new Error('rotated-core target function not found');
  for (const param of target.params) {
    if (param.type !== 'Identifier') throw new Error('rotated-core target function not found');
  }

  /** @type {Array<{fn:any,shape:{leftShift:number,rightShift:number}}>} */
  const rotators = [];
  for (const fn of functions) {
    const shape = classifyRotate(fn);
    if (shape) rotators.push({fn, shape});
  }
  if (rotators.length !== 2) throw new Error('rotation helper pair not found');
  let forward = rotators[0];
  if (countCalls(target.body, rotators[1].fn.id.name) >
      countCalls(target.body, rotators[0].fn.id.name)) {
    forward = rotators[1];
  }
  const inverse = rotators[0] === forward ? rotators[1] : rotators[0];
  if (!inverse || !forward.shape || !inverse.shape) throw new Error('inverse rotation helper not found');
  const rotation = forward.shape.leftShift;
  if (inverse.shape.leftShift !== 32 - rotation || inverse.shape.rightShift !== rotation) {
    throw new Error('rotation helpers are not inverse coordinates');
  }
  if (countCalls(target.body, forward.fn.id.name) < 4 ||
      countCalls(target.body, inverse.fn.id.name) !== 1) {
    throw new Error('unexpected coordinate boundary usage');
  }

  let add = null;
  for (const fn of functions) {
    if (fn.params.length === 2 && isPackedRotatedAdd(fn, rotation)) {
      add = fn;
      break;
    }
  }
  if (!add || !add.id || countCalls(target.body, add.id.name) !== 2) {
    throw new Error('packed rotated-add helper not found');
  }

  let returnStatement = null;
  for (const statement of target.body.body) {
    if (statement.type === 'ReturnStatement') {
      returnStatement = statement;
      break;
    }
  }
  if (!returnStatement || directCallName(returnStatement.argument) !== inverse.fn.id.name) {
    throw new Error('coordinate exit is not the inverse rotation');
  }

  const x = target.params[0].name;
  const y = target.params[1].name;
  const z = target.params[2].name;
  const t = target.params[3].name;
  const recoveredSource = 'function recovered(' + [x, y, z, t].join(',') + '){' +
    'const left=(((((' + x + '^' + t + ')+' + y + ')|0)+(' + z + '&' + t + '))|0);' +
    'const right=(((' + x + '+' + z + ')|0)|' + y + ');return (left^right)|0;}';
  return {rotation, recoveredSource};
}

module.exports = {recoverRotatedCoreSource};
