'use strict';

const {parse, walk} = require('../src/ast');

/** @typedef {import('../src/ast').AstNode} AstNode */

/**
 * @typedef {object} Symbolic
 * @property {'const'|'input'|'imul'|'xor'|'ushr'|'shl'|'or'|'builtin'} kind
 * @property {number} [value]
 * @property {number} [index]
 * @property {string} [name]
 * @property {Symbolic[]} [terms]
 * @property {Symbolic} [left]
 * @property {Symbolic} [right]
 * @property {Symbolic} [base]
 * @property {number} [shift]
 */

/**
 * @typedef {object} Helper
 * @property {string[]} params
 * @property {AstNode} expression
 */

/**
 * @typedef {object} RecoveredRound
 * @property {number[]} coefficients
 * @property {number[]} xorShifts
 * @property {number[]} cyclicShifts
 */

/** @param {number} value @returns {Symbolic} */
function constant(value) {
  return {kind: 'const', value: value >>> 0};
}

/** @param {Symbolic} expression @returns {string} */
function symbolicKey(expression) {
  if (expression.kind === 'const') return 'c:' + String(expression.value >>> 0);
  if (expression.kind === 'input') return 'i:' + String(expression.index);
  if (expression.kind === 'builtin') return 'b:' + String(expression.name);
  if (expression.kind === 'ushr' || expression.kind === 'shl') {
    return expression.kind + ':' + String(expression.shift) + ':' +
      symbolicKey(/** @type {Symbolic} */ (expression.base));
  }
  if (expression.kind === 'imul') {
    const sides = [
      symbolicKey(/** @type {Symbolic} */ (expression.left)),
      symbolicKey(/** @type {Symbolic} */ (expression.right))
    ].sort();
    return 'm:' + sides.join(':');
  }
  const terms = (expression.terms ?? []).map(symbolicKey).sort();
  return expression.kind + ':[' + terms.join(',') + ']';
}

/** @param {Symbolic} left @param {Symbolic} right @returns {boolean} */
function sameSymbolic(left, right) {
  return symbolicKey(left) === symbolicKey(right);
}

/** @param {Symbolic[]} source @returns {Symbolic} */
function makeXor(source) {
  /** @type {Symbolic[]} */
  const flat = [];
  for (const term of source) {
    if (term.kind === 'xor') flat.push(...(term.terms ?? []));
    else flat.push(term);
  }

  let literal = 0;
  /** @type {Map<string,{term:Symbolic,odd:boolean}>} */
  const parity = new Map();
  for (const term of flat) {
    if (term.kind === 'const') {
      literal = (literal ^ (term.value ?? 0)) >>> 0;
      continue;
    }
    const key = symbolicKey(term);
    const prior = parity.get(key);
    if (prior) prior.odd = !prior.odd;
    else parity.set(key, {term, odd: true});
  }

  const terms = [...parity.values()]
    .filter(entry => entry.odd)
    .map(entry => entry.term);
  if (literal !== 0) terms.push(constant(literal));
  terms.sort((a, b) => symbolicKey(a).localeCompare(symbolicKey(b)));
  if (terms.length === 0) return constant(0);
  if (terms.length === 1) return /** @type {Symbolic} */ (terms[0]);
  return {kind: 'xor', terms};
}

/** @param {Symbolic[]} source @returns {Symbolic} */
function makeOr(source) {
  const terms = source.filter(term => !(term.kind === 'const' && (term.value ?? 0) === 0));
  if (terms.length === 0) return constant(0);
  if (terms.length === 1) return /** @type {Symbolic} */ (terms[0]);
  terms.sort((a, b) => symbolicKey(a).localeCompare(symbolicKey(b)));
  return {kind: 'or', terms};
}

/** @param {Symbolic} left @param {Symbolic} right @returns {Symbolic} */
function makeImul(left, right) {
  if (left.kind === 'const' && right.kind === 'const') {
    return constant(Math.imul(left.value ?? 0, right.value ?? 0));
  }
  if (left.kind === 'const' && (left.value ?? 0) === 0) return constant(0);
  if (right.kind === 'const' && (right.value ?? 0) === 0) return constant(0);
  if (left.kind === 'const' && (left.value ?? 0) === 1) return right;
  if (right.kind === 'const' && (right.value ?? 0) === 1) return left;
  return {kind: 'imul', left, right};
}

/** @param {AstNode} node @returns {number|null} */
function integerLiteral(node) {
  if (node.type === 'Literal' && typeof node.value === 'number' &&
      Number.isInteger(node.value)) return node.value;
  if (node.type === 'UnaryExpression' && node.operator === '-' &&
      node.argument.type === 'Literal' && typeof node.argument.value === 'number' &&
      Number.isInteger(node.argument.value)) return -node.argument.value;
  return null;
}

/** @param {AstNode} node @returns {AstNode|null} */
function returnedExpression(node) {
  if (node.type === 'ArrowFunctionExpression' && node.body.type !== 'BlockStatement') {
    return node.body;
  }
  if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type) ||
      node.body.type !== 'BlockStatement') return null;
  const statements = node.body.body.filter((/** @type {AstNode} */ statement) =>
    statement.type !== 'ExpressionStatement' ||
    typeof statement.expression.value !== 'string');
  if (statements.length !== 1 || statements[0].type !== 'ReturnStatement') return null;
  return statements[0].argument ?? null;
}

/** @param {AstNode} ast @returns {Map<string,Helper>} */
function collectHelpers(ast) {
  /** @type {Map<string,Helper>} */
  const helpers = new Map();
  walk(ast, node => {
    /** @type {string|null} */
    let name = null;
    /** @type {AstNode|null} */
    let fn = null;
    if (node.type === 'FunctionDeclaration' && node.id?.type === 'Identifier') {
      name = node.id.name;
      fn = node;
    } else if (node.type === 'VariableDeclarator' &&
               node.id.type === 'Identifier' && node.init &&
               ['FunctionExpression', 'ArrowFunctionExpression'].includes(node.init.type)) {
      name = node.id.name;
      fn = node.init;
    }
    if (!name || !fn) return;
    const expression = returnedExpression(fn);
    if (!expression) return;
    /** @type {string[]} */
    const params = [];
    for (const param of fn.params) {
      if (param.type !== 'Identifier') return;
      params.push(param.name);
    }
    helpers.set(name, {params, expression});
  });
  return helpers;
}

/**
 * @param {AstNode} node
 * @param {Map<string,Symbolic>} environment
 * @param {Map<string,Helper>} helpers
 * @param {number} [depth]
 * @returns {Symbolic|null}
 */
function build(node, environment, helpers, depth = 0) {
  if (depth > 96) return null;

  const literal = integerLiteral(node);
  if (literal !== null) return constant(literal);

  if (node.type === 'Identifier') return environment.get(node.name) ?? null;

  if (node.type === 'MemberExpression' && !node.computed &&
      node.object.type === 'Identifier' && node.object.name === 'Math' &&
      node.property.type === 'Identifier' && node.property.name === 'imul') {
    return {kind: 'builtin', name: 'imul'};
  }

  if (node.type === 'UnaryExpression' && node.operator === '~') {
    const argument = build(node.argument, environment, helpers, depth + 1);
    if (argument?.kind !== 'const') return null;
    return constant(~(argument.value ?? 0));
  }

  if (node.type === 'BinaryExpression') {
    const left = build(node.left, environment, helpers, depth + 1);
    const right = build(node.right, environment, helpers, depth + 1);
    if (!left || !right) return null;

    if (node.operator === '^') return makeXor([left, right]);
    if (node.operator === '|') return makeOr([left, right]);

    if (['+', '-', '*'].includes(node.operator) &&
        left.kind === 'const' && right.kind === 'const') {
      const a = left.value ?? 0;
      const b = right.value ?? 0;
      if (node.operator === '+') return constant(a + b);
      if (node.operator === '-') return constant(a - b);
      return constant(a * b);
    }

    if (['>>>', '>>', '<<'].includes(node.operator) && right.kind === 'const') {
      const shift = (right.value ?? 0) & 31;
      if (shift === 0) return left;
      if (left.kind === 'const') {
        const value = left.value ?? 0;
        if (node.operator === '>>>') return constant(value >>> shift);
        if (node.operator === '>>') return constant(value >> shift);
        return constant(value << shift);
      }
      if (node.operator === '>>>') return {kind: 'ushr', base: left, shift};
      if (node.operator === '<<') return {kind: 'shl', base: left, shift};
      return null;
    }
    return null;
  }

  if (node.type === 'CallExpression') {
    if (node.arguments.some((/** @type {AstNode} */ argument) =>
      argument.type === 'SpreadElement')) return null;
    const args = [];
    for (const argument of node.arguments) {
      const value = build(argument, environment, helpers, depth + 1);
      if (!value) return null;
      args.push(value);
    }

    let directImul = false;
    if (node.callee.type === 'MemberExpression' && !node.callee.computed &&
        node.callee.object.type === 'Identifier' && node.callee.object.name === 'Math' &&
        node.callee.property.type === 'Identifier' && node.callee.property.name === 'imul') {
      directImul = true;
    } else if (node.callee.type === 'Identifier') {
      const value = environment.get(node.callee.name);
      directImul = value?.kind === 'builtin' && value.name === 'imul';
    }
    if (directImul) {
      return args.length === 2 ? makeImul(
        /** @type {Symbolic} */ (args[0]),
        /** @type {Symbolic} */ (args[1])
      ) : null;
    }

    if (node.callee.type === 'Identifier') {
      const helper = helpers.get(node.callee.name);
      if (!helper || helper.params.length !== args.length) return null;
      const local = new Map(environment);
      for (let index = 0; index < helper.params.length; index++) {
        local.set(helper.params[index], /** @type {Symbolic} */ (args[index]));
      }
      return build(helper.expression, local, helpers, depth + 1);
    }
  }

  return null;
}

/**
 * Evaluate an expression that may contain simple sequence/assignment forms.
 * @param {AstNode} node
 * @param {Map<string,Symbolic>} environment
 * @param {Map<string,Helper>} helpers
 * @returns {Symbolic|null}
 */
function evaluate(node, environment, helpers) {
  if (node.type === 'SequenceExpression') {
    let value = null;
    for (const expression of node.expressions) value = evaluate(expression, environment, helpers);
    return value;
  }
  if (node.type === 'AssignmentExpression' && node.operator === '=' &&
      node.left.type === 'Identifier') {
    const value = evaluate(node.right, environment, helpers);
    if (!value) return null;
    environment.set(node.left.name, value);
    return value;
  }
  return build(node, environment, helpers);
}

/**
 * @param {AstNode} functionNode
 * @param {Map<string,Helper>} helpers
 * @returns {{expression:Symbolic,target:number}|null}
 */
function symbolicPredicate(functionNode, helpers) {
  if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(
    functionNode.type
  ) || functionNode.body.type !== 'BlockStatement') return null;

  /** @type {Map<string,Symbolic>} */
  const environment = new Map();
  for (let index = 0; index < functionNode.params.length; index++) {
    const param = functionNode.params[index];
    if (param.type !== 'Identifier') return null;
    environment.set(param.name, {kind: 'input', index});
  }

  for (const statement of functionNode.body.body) {
    if (statement.type === 'VariableDeclaration') {
      for (const declaration of statement.declarations) {
        if (declaration.id.type !== 'Identifier' || !declaration.init) return null;
        const value = evaluate(declaration.init, environment, helpers);
        if (!value) return null;
        environment.set(declaration.id.name, value);
      }
      continue;
    }

    if (statement.type === 'ExpressionStatement') {
      if (typeof statement.expression.value === 'string') continue;
      if (!evaluate(statement.expression, environment, helpers)) return null;
      continue;
    }

    if (statement.type === 'ReturnStatement' && statement.argument) {
      let returned = statement.argument;
      if (returned.type === 'SequenceExpression') {
        const expressions = returned.expressions;
        for (let index = 0; index < expressions.length - 1; index++) {
          if (!evaluate(expressions[index], environment, helpers)) return null;
        }
        returned = expressions[expressions.length - 1];
      }
      if (returned.type !== 'BinaryExpression' ||
          !['===', '=='].includes(returned.operator)) return null;
      const left = build(returned.left, environment, helpers);
      const right = build(returned.right, environment, helpers);
      if (!left || !right) return null;
      if (left.kind === 'const' && right.kind !== 'const') {
        return {expression: right, target: left.value ?? 0};
      }
      if (right.kind === 'const' && left.kind !== 'const') {
        return {expression: left, target: right.value ?? 0};
      }
      return null;
    }

    return null;
  }
  return null;
}

/**
 * @param {Symbolic} expression
 * @returns {{base:Symbolic,coefficients:number[]}|null}
 */
function matchPolynomial(expression) {
  const terms = expression.kind === 'xor' ? expression.terms ?? [] : [expression];
  let additive = 0;
  /** @type {Symbolic|null} */
  let product = null;
  for (const term of terms) {
    if (term.kind === 'const') {
      additive = (additive ^ (term.value ?? 0)) >>> 0;
    } else if (term.kind === 'imul' && product === null) {
      product = term;
    } else {
      return null;
    }
  }
  if (!product) return null;
  const left = /** @type {Symbolic} */ (product.left);
  const right = /** @type {Symbolic} */ (product.right);
  let multiplier = null;
  /** @type {Symbolic|null} */
  let base = null;
  if (left.kind === 'const' && right.kind !== 'const') {
    multiplier = left.value ?? 0;
    base = right;
  } else if (right.kind === 'const' && left.kind !== 'const') {
    multiplier = right.value ?? 0;
    base = left;
  }
  if (multiplier === null || !base || (multiplier & 1) === 0) return null;
  return {base, coefficients: [additive >>> 0, multiplier >>> 0]};
}

/**
 * @param {Symbolic} expression
 * @returns {{base:Symbolic,shifts:number[]}|null}
 */
function matchXorShift(expression) {
  if (expression.kind !== 'xor') return null;
  const terms = expression.terms ?? [];
  if (terms.length < 2) return null;
  for (const candidate of terms) {
    /** @type {number[]} */
    const shifts = [];
    let valid = true;
    for (const term of terms) {
      if (term === candidate) continue;
      if (term.kind !== 'ushr' || !term.base ||
          !sameSymbolic(term.base, candidate) ||
          !term.shift || term.shift < 1 || term.shift > 31) {
        valid = false;
        break;
      }
      shifts.push(term.shift);
    }
    if (valid && shifts.length === terms.length - 1) {
      shifts.sort((a, b) => a - b);
      return {base: candidate, shifts};
    }
  }
  return null;
}

/**
 * @param {Symbolic} expression
 * @returns {{base:Symbolic,shift:number}|null}
 */
function matchRotation(expression) {
  if (expression.kind !== 'or') return null;
  const terms = expression.terms ?? [];
  if (terms.length !== 2) return null;
  const left = terms.find(term => term.kind === 'shl');
  const right = terms.find(term => term.kind === 'ushr');
  if (!left?.base || !right?.base || !left.shift || !right.shift) return null;
  if (left.shift < 1 || left.shift > 31 ||
      right.shift < 1 || right.shift > 31 ||
      left.shift + right.shift !== 32 ||
      !sameSymbolic(left.base, right.base)) return null;
  return {base: left.base, shift: left.shift};
}

/**
 * @param {Symbolic} expression
 * @returns {{base:Symbolic,shifts:number[]}|null}
 */
function matchCyclic(expression) {
  if (expression.kind !== 'xor') return null;
  const terms = expression.terms ?? [];
  if (terms.length < 3 || (terms.length & 1) === 0) return null;
  /** @type {Symbolic|null} */
  let base = null;
  /** @type {number[]} */
  const shifts = [];
  for (const term of terms) {
    const rotation = matchRotation(term);
    if (!rotation) return null;
    if (base === null) base = rotation.base;
    else if (!sameSymbolic(base, rotation.base)) return null;
    shifts.push(rotation.shift);
  }
  if (!base) return null;
  shifts.sort((a, b) => a - b);
  return {base, shifts};
}

/**
 * Recover independently parameterized, unrolled author-style Int32 rounds
 * from assignment/dataflow structure rather than variable names or exact
 * expression spelling.
 *
 * @param {string} source
 * @returns {{rounds:RecoveredRound[],target:number,inputIndex:number}}
 */
function recoverDataflow(source) {
  const ast = parse(source, 'commonjs');
  const helpers = collectHelpers(ast);
  /** @type {AstNode[]} */
  const functions = [];
  walk(ast, node => {
    if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(
      node.type
    )) functions.push(node);
  });

  for (const functionNode of functions) {
    const predicate = symbolicPredicate(functionNode, helpers);
    if (!predicate) continue;

    let current = predicate.expression;
    /** @type {RecoveredRound[]} */
    const reversed = [];
    while (true) {
      const cyclic = matchCyclic(current);
      if (!cyclic) break;
      const xorShift = matchXorShift(cyclic.base);
      if (!xorShift) break;
      const polynomial = matchPolynomial(xorShift.base);
      if (!polynomial) break;
      reversed.push({
        coefficients: polynomial.coefficients,
        xorShifts: xorShift.shifts,
        cyclicShifts: cyclic.shifts
      });
      current = polynomial.base;
    }

    if (reversed.length === 0 || current.kind !== 'input') continue;
    return {
      rounds: reversed.reverse(),
      target: predicate.target >>> 0,
      inputIndex: current.index ?? 0
    };
  }

  throw new Error('dataflow-normalized author-style predicate not found');
}

module.exports = {recoverDataflow};
