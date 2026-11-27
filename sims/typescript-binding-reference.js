'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

/** @typedef {{name:string,source:string,module?:boolean,refIndex?:number,expected:string}} Fixture */

/** @param {string} fileName @param {string} defaultLibDirectory @returns {boolean} */
function isDefaultLibrary(fileName, defaultLibDirectory) {
  const resolved = path.resolve(fileName);
  const prefix = path.resolve(defaultLibDirectory) + path.sep;
  return resolved.startsWith(prefix) && path.basename(resolved).startsWith('lib.');
}

/** @param {import('typescript').Identifier} node @returns {boolean} */
function isBindingName(node) {
  const parent = node.parent;
  return (ts.isVariableDeclaration(parent) && parent.name === node) ||
    (ts.isParameter(parent) && parent.name === node) ||
    (ts.isClassDeclaration(parent) && parent.name === node) ||
    (ts.isFunctionDeclaration(parent) && parent.name === node) ||
    (ts.isFunctionExpression(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && parent.name === node) ||
    (ts.isImportClause(parent) && parent.name === node) ||
    (ts.isImportSpecifier(parent) && parent.name === node) ||
    (ts.isNamespaceImport(parent) && parent.name === node);
}

/** @param {import('typescript').Node} node @returns {boolean} */
function isFunctionScope(node) {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) || ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node);
}

/**
 * Use the TypeScript checker as a development-time binding reference, not as
 * the production obfuscator's host-trust or lexical-scope proof.
 * @param {Fixture} fixture
 * @returns {{name:string,classification:string,decision:string,declarations:string[],diagnostics:number}}
 */
function inspectFixture(fixture) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'obfs-binding-reference-'));
  const file = path.join(directory, 'fixture.js');
  fs.writeFileSync(file, fixture.source);
  try {
    const options = {
      allowJs: true,
      checkJs: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: fixture.module ? ts.ModuleKind.ESNext : ts.ModuleKind.None,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      types: [],
      skipLibCheck: true
    };
    const program = ts.createProgram([file], options);
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(file);
    if (!sourceFile) throw new Error('TypeScript did not create the fixture source file');
    /** @type {import('typescript').Identifier[]} */
    const references = [];
    /** @param {import('typescript').Node} node */
    function visit(node) {
      if (ts.isIdentifier(node) && node.text === fixture.name && !isBindingName(node)) {
        references.push(node);
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    const reference = references[fixture.refIndex ?? 0];
    if (!reference) throw new Error('No reference to ' + fixture.name + ' in ' + fixture.source);
    const symbol = checker.getSymbolAtLocation(reference);
    const declarations = symbol?.declarations ?? [];
    const type = checker.getTypeAtLocation(reference);
    const intrinsicGlobalThis = fixture.name === 'globalThis' && symbol?.name === 'globalThis' &&
      declarations.length === 0 && checker.typeToString(type) === 'typeof globalThis';
    const defaultLibDirectory = path.dirname(ts.getDefaultLibFilePath(options));
    let hasDirectEval = false;
    let hasWith = false;
    /** @param {import('typescript').Node} node @param {import('typescript').Node} root */
    function scanScope(node, root) {
      if (node !== root && isFunctionScope(node)) return;
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
          node.expression.text === 'eval' && !node.questionDotToken) {
        const evalSymbol = checker.getSymbolAtLocation(node.expression);
        const evalDeclarations = evalSymbol?.declarations ?? [];
        const shadowedEval = evalDeclarations.some(d =>
          !isDefaultLibrary(d.getSourceFile().fileName, defaultLibDirectory) &&
          !d.getSourceFile().isDeclarationFile && d.kind !== ts.SyntaxKind.Identifier);
        if (!shadowedEval) hasDirectEval = true;
      }
      ts.forEachChild(node, child => scanScope(child, root));
    }
    for (let current = reference.parent; current; current = current.parent) {
      if (ts.isWithStatement(current)) hasWith = true;
      if (isFunctionScope(current) || ts.isSourceFile(current)) scanScope(current, current);
    }
    const hasLocal = declarations.some(d =>
      !isDefaultLibrary(d.getSourceFile().fileName, defaultLibDirectory) &&
      !d.getSourceFile().isDeclarationFile && d.kind !== ts.SyntaxKind.Identifier);
    const hasDefaultLib = intrinsicGlobalThis || declarations.some(d =>
      isDefaultLibrary(d.getSourceFile().fileName, defaultLibDirectory));
    const classification = !symbol ? 'unresolved' :
      hasLocal && hasDefaultLib ? 'merged' :
      hasLocal ? 'local' :
      hasDefaultLib ? 'ambient' : 'unknown';
    const decision = hasWith ? 'unknown-with' : hasDirectEval ? 'unknown-direct-eval' :
      classification === 'ambient' ? 'host-global-candidate' :
      classification === 'local' ? 'shadowed-local' : 'unknown';
    const declarationNames = declarations.map(d =>
      ts.SyntaxKind[d.kind] + ':' + path.basename(d.getSourceFile().fileName));
    const result = {
      name: fixture.name,
      classification,
      decision,
      declarations: declarationNames,
      hasDirectEval,
      hasWith,
      diagnostics: program.getSyntacticDiagnostics(sourceFile).length
    };
    assert.equal(decision, fixture.expected,
      'unexpected resolution for ' + fixture.name + ': ' + fixture.source);
    return result;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const fixtures = [
  { name: 'window', module: true, source: 'export {}; window.onerror = handler;', expected: 'host-global-candidate' },
  { name: 'window', module: true, source: 'export {}; function f(window, handler) { window.onerror = handler; }', expected: 'shadowed-local' },
  { name: 'window', module: true, source: 'export {}; try { throw 1; } catch (window) { window.onerror = handler; }', expected: 'shadowed-local' },
  { name: 'window', module: true, source: 'export {}; function outer() { class window {} return window; }', expected: 'shadowed-local' },
  { name: 'window', module: true, source: 'export {}; const f = function window() { return window; };', expected: 'shadowed-local' },
  { name: 'window', module: true, source: 'export {}; function f() { { var window = local; } return window; }', expected: 'shadowed-local' },
  { name: 'window', module: true, source: 'export {}; function f({window}) { return window; }', expected: 'shadowed-local' },
  { name: 'window', module: true, source: 'export {}; function f() { { let window = local; return window; } }', expected: 'shadowed-local' },
  { name: 'localStorage', module: true, source: 'export {}; function f(localStorage) { localStorage.setItem("x", 1); } localStorage.setItem("y", 2);', refIndex: 0, expected: 'shadowed-local' },
  { name: 'localStorage', module: true, source: 'export {}; function f(localStorage) { localStorage.setItem("x", 1); } localStorage.setItem("y", 2);', refIndex: 1, expected: 'host-global-candidate' },
  { name: 'sessionStorage', module: true, source: 'export {}; sessionStorage.setItem("x", 1);', expected: 'host-global-candidate' },
  { name: 'Storage', module: true, source: 'export {}; function f(Storage) { return new Storage(); } new Storage();', refIndex: 0, expected: 'shadowed-local' },
  { name: 'Storage', module: true, source: 'export {}; function f(Storage) { return new Storage(); } new Storage();', refIndex: 1, expected: 'host-global-candidate' },
  { name: 'self', module: true, source: 'export {}; self.location.href;', expected: 'host-global-candidate' },
  { name: 'globalThis', module: true, source: 'export {}; globalThis.window;', expected: 'host-global-candidate' },
  { name: 'globalThis', module: true, source: 'export {}; function f(globalThis) { return globalThis.window; }', expected: 'shadowed-local' },
  { name: 'window', source: 'function f(o) { with (o) { window.onerror = handler; } }', expected: 'unknown-with' },
  { name: 'window', source: 'function f() { eval("var window = local"); window.onerror = handler; }', expected: 'unknown-direct-eval' },
  { name: 'window', source: 'function outer() { eval("var window = local"); return function inner() { window.onerror = handler; }; }', expected: 'unknown-direct-eval' },
  { name: 'window', source: 'function outer() { function sibling() { eval("var window = local"); } return function inner() { window.onerror = handler; }; }', expected: 'host-global-candidate' },
  { name: 'window', source: 'function f(eval) { eval("var window = local"); window.onerror = handler; }', expected: 'host-global-candidate' },
  { name: 'window', source: 'var window; window.onerror = handler;', expected: 'unknown' },
  { name: 'window', module: true, source: 'export {}; var window; window.onerror = handler;', expected: 'shadowed-local' }
];

const output = fixtures.map((fixture, index) => ({ case: index + 1, ...inspectFixture(fixture) }));
process.stdout.write(JSON.stringify({
  node: process.version,
  typescript: ts.version,
  cases: output.length,
  output
}, null, 2) + '\n');
