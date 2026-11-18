'use strict';

const {parse, walk} = require('../src/ast');

/** @typedef {import('../src/ast').AstNode} AstNode */

/**
 * @param {AstNode} node
 * @param {string} operator
 * @param {AstNode[]} [out]
 * @returns {AstNode[]}
 */
function flatten(node, operator, out = []) {
  if (node.type === 'BinaryExpression' && node.operator === operator) {
    flatten(node.left, operator, out);
    flatten(node.right, operator, out);
  } else {
    out.push(node);
  }
  return out;
}

/** @param {AstNode} node @returns {number|null} */
function integerLiteral(node) {
  if (node.type === 'Literal' && typeof node.value === 'number' &&
      Number.isInteger(node.value)) return node.value;
  if (node.type === 'UnaryExpression' && node.operator === '-' &&
      node.argument.type === 'Literal' &&
      typeof node.argument.value === 'number' &&
      Number.isInteger(node.argument.value)) return -node.argument.value;
  return null;
}

/** @param {AstNode} node @returns {number|null} */
function uint32Literal(node) {
  const value = integerLiteral(node);
  return value === null ? null : value >>> 0;
}

/** @param {AstNode} node @returns {AstNode} */
function stripUint32(node) {
  if (node.type === 'BinaryExpression' && node.operator === '>>>' &&
      integerLiteral(node.right) === 0) return node.left;
  return node;
}

/** @param {AstNode} node @returns {boolean} */
function isMathImul(node) {
  if (node.type !== 'CallExpression' || node.arguments.length !== 2) return false;
  const callee = node.callee;
  return callee.type === 'MemberExpression' && !callee.computed &&
    callee.object.type === 'Identifier' && callee.object.name === 'Math' &&
    callee.property.type === 'Identifier' && callee.property.name === 'imul';
}

/** @param {AstNode} node @returns {number[]|null} */
function polynomial(node) {
  const terms = flatten(stripUint32(node), '^');
  if (terms.length !== 2) return null;
  let constant = null;
  let multiplier = null;
  for (const term of terms) {
    const literal = uint32Literal(term);
    if (literal !== null) {
      constant = literal;
      continue;
    }
    if (!isMathImul(term)) return null;
    for (const argument of term.arguments) {
      const candidate = uint32Literal(argument);
      if (candidate !== null) {
        multiplier = candidate;
        break;
      }
    }
    if (multiplier === null) return null;
  }
  return constant !== null && multiplier !== null ? [constant, multiplier] : null;
}

/** @param {AstNode} node @returns {number[]|null} */
function xorShifts(node) {
  const terms = flatten(stripUint32(node), '^');
  if (terms.length < 2) return null;
  let baseCount = 0;
  /** @type {number[]} */
  const shifts = [];
  for (const term of terms) {
    if (term.type === 'BinaryExpression' && term.operator === '>>>') {
      const amount = integerLiteral(term.right);
      if (amount === null || amount < 1 || amount > 31) return null;
      shifts.push(amount);
    } else {
      baseCount++;
    }
  }
  return baseCount === 1 && shifts.length === terms.length - 1 ? shifts : null;
}

/** @param {AstNode} node @returns {number|null} */
function rotationShift(node) {
  if (node.type !== 'BinaryExpression' || node.operator !== '|') return null;
  const sides = [node.left, node.right];
  let left = null;
  let right = null;
  for (const side of sides) {
    if (side.type !== 'BinaryExpression') return null;
    if (side.operator === '<<') left = integerLiteral(side.right);
    else if (side.operator === '>>>') right = integerLiteral(side.right);
    else return null;
  }
  if (left === null || right === null || left < 1 || left > 31 ||
      right < 1 || right > 31 || left + right !== 32) return null;
  return left;
}

/** @param {AstNode} node @returns {number[]|null} */
function cyclicShifts(node) {
  const terms = flatten(stripUint32(node), '^');
  if (terms.length < 3 || (terms.length & 1) === 0) return null;
  /** @type {number[]} */
  const shifts = [];
  for (const term of terms) {
    const shift = rotationShift(term);
    if (shift === null) return null;
    shifts.push(shift);
  }
  return shifts;
}

/**
 * Recover the public repeated-round Int32 permutation parameters from an
 * ordinary-minified author-style predicate.
 * @param {string} source
 * @returns {{rounds:number,coefficients:number[],xorShifts:number[],cyclicShifts:number[],target:number}}
 */
function recover(source) {
  const ast = parse(source, 'commonjs');
  /** @type {AstNode[]} */
  const loops = [];
  let target = null;

  walk(ast, node => {
    if (node.type === 'ForStatement') loops.push(node);
    if (node.type === 'ReturnStatement' && node.argument?.type === 'BinaryExpression' &&
        ['===', '=='].includes(node.argument.operator)) {
      const left = uint32Literal(node.argument.left);
      const right = uint32Literal(node.argument.right);
      if (left !== null) target = left;
      if (right !== null) target = right;
    }
  });

  const loop = loops[0];
  if (!loop || target === null) throw new Error('author-style loop or target not found');
  const test = loop.test;
  if (!test || test.type !== 'BinaryExpression' || test.operator !== '<') {
    throw new Error('round bound not found');
  }
  const rounds = integerLiteral(test.right);
  if (rounds === null || rounds < 1) throw new Error('literal round count not found');

  /** @type {AstNode[]} */
  const rights = [];
  walk(loop.body, node => {
    if (node.type === 'AssignmentExpression' && node.operator === '=') {
      rights.push(node.right);
    }
  });

  let coefficients = null;
  let rightShifts = null;
  let rotations = null;
  for (const right of rights) {
    coefficients ??= polynomial(right);
    rightShifts ??= xorShifts(right);
    rotations ??= cyclicShifts(right);
  }
  if (!coefficients || !rightShifts || !rotations) {
    throw new Error('round parameters not structurally recoverable');
  }

  return {
    rounds,
    coefficients,
    xorShifts: rightShifts,
    cyclicShifts: rotations,
    target
  };
}

module.exports = {recover};
