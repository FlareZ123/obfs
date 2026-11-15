'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const ts = require('typescript');

/** @typedef {{ ids: Set<number>, unknown: boolean }} Value */
/** @typedef {{ filename: string, node: import('typescript').ObjectLiteralExpression, properties: Map<string, import('typescript').PropertyAssignment>, blocked: Set<string> }} Allocation */
/** @typedef {{ files: Record<string,string>, renamed: number, diagnostics: string[] }} Result */

/**
 * Conservatively rename own properties of proven, nonescaping object literals.
 * Source text is patched at token boundaries, preserving comments, line endings,
 * module syntax, semicolon placement, and every other unmodified source byte.
 *
 * @param {Record<string, string>} files Repository-relative .js/.mjs/.cjs files.
 * @param {{seed?: string, closedWorld?: boolean}} [options]
 * @returns {Result}
 */
function transform(files, options = {}) {
  const entries = Object.entries(files);
  const seed = String(options.seed ?? 'obfs-v1');
  const root = '/obfs-virtual';
  const originals = new Map(entries.map(([name, source]) => {
    if (!/\.(?:c|m)?js$/i.test(name) || path.isAbsolute(name) || name.split(/[\\/]/).includes('..')) {
      throw new Error(`Invalid JavaScript file path: ${name}`);
    }
    if (typeof source !== 'string') throw new TypeError(`Source must be a string: ${name}`);
    return [path.posix.join(root, name.replace(/\\/g, '/')), source];
  }));
  if (originals.size !== entries.length) throw new Error('Duplicate normalized input paths');
  const compilerOptions = {
    allowJs: true,
    checkJs: false,
    noEmit: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: true,
  };
  const host = ts.createCompilerHost(compilerOptions);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const directoryExists = host.directoryExists?.bind(host);
  host.readFile = filename => originals.get(filename) ?? readFile(filename);
  host.fileExists = filename => originals.has(filename) || fileExists(filename);
  host.directoryExists = filename => filename === root || [...originals.keys()].some(f => f.startsWith(filename + '/')) || !!directoryExists?.(filename);
  host.getSourceFile = (filename, languageVersion, onError, shouldCreateNewSourceFile) => {
    const code = host.readFile(filename);
    if (code === undefined) return undefined;
    return ts.createSourceFile(filename, code, languageVersion, true, ts.ScriptKind.JS);
  };

  const program = ts.createProgram([...originals.keys()], compilerOptions, host);
  const checker = program.getTypeChecker();
  /** @type {import('typescript').SourceFile[]} */
  const sources = [...originals.keys()].map(p => {
    const source = program.getSourceFile(p);
    if (!source) throw new Error(`Unable to load source: ${p}`);
    return source;
  });
  const diagnostics = [];
  for (const file of sources) {
    const syntaxErrors = program.getSyntacticDiagnostics(file);
    if (syntaxErrors.length) {
      const d = syntaxErrors[0];
      throw new SyntaxError(`${path.posix.relative(root, file.fileName)}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
    }
  }

  /** @param {import('typescript').Identifier} node */
  function symbol(node) {
    const sym = checker.getSymbolAtLocation(node);
    return sym && sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
  }
  /** @param {import('typescript').Node} node @param {(node: import('typescript').Node) => void} cb */
  function visit(node, cb) { cb(node); ts.forEachChild(node, child => visit(child, cb)); }
  /** @param {import('typescript').Expression} rhs @returns {boolean} */
  function isStaticallyPrimitive(rhs) {
    return ts.isStringLiteral(rhs) || ts.isNumericLiteral(rhs) ||
      ts.isNoSubstitutionTemplateLiteral(rhs) || ts.isBigIntLiteral(rhs) ||
      [ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(rhs.kind) ||
      (ts.isPrefixUnaryExpression(rhs) && ts.isNumericLiteral(rhs.operand) &&
        [ts.SyntaxKind.MinusToken,ts.SyntaxKind.PlusToken].includes(rhs.operator));
  }
  /** @type {Allocation[]} */
  const allocations = [];
  /** @type {Set<import('typescript').Symbol>} */
  const globalAliases = new Set();
  /** @param {import('typescript').Expression} expr @returns {boolean} */
  function isGlobalObject(expr) {
    if (ts.isParenthesizedExpression(expr)) return isGlobalObject(expr.expression);
    if (!ts.isIdentifier(expr)) return false;
    if (['globalThis','window','self','global'].includes(expr.text)) return true;
    const s = symbol(expr);
    return !!s && globalAliases.has(s);
  }
  // Propagate simple aliases of the ambient global object so indirect eval
  // lookups do not evade the lexical `eval` detector.
  let aliasChanged = true;
  while (aliasChanged) {
    aliasChanged = false;
    for (const file of sources) visit(file,node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
          isGlobalObject(node.initializer)) {
        const s = symbol(node.name);
        if (s && !globalAliases.has(s)) {globalAliases.add(s);aliasChanged=true;}
      }
    });
  }
  /** @type {Map<import('typescript').ObjectLiteralExpression, number>} */
  const byLiteral = new Map();
  /** @type {Map<import('typescript').Symbol,import('typescript').FunctionDeclaration|import('typescript').FunctionExpression>} */
  const functions = new Map();
  /** @type {Set<import('typescript').Symbol>} */
  const exportSymbols = new Set();
  let hasDynamicCode = false;

  for (const file of sources) {
    visit(file, node => {
      if (ts.isIdentifier(node) && (node.text === 'eval' || node.text === 'Function')) hasDynamicCode = true;
      if (ts.isStringLiteral(node) && (node.text === 'eval' || node.text === 'Function')) hasDynamicCode = true;
      if (ts.isElementAccessExpression(node) && isGlobalObject(node.expression)) hasDynamicCode = true;
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'Reflect' &&
          node.expression.name.text === 'get' && node.arguments.some(isGlobalObject)) hasDynamicCode = true;
      if (ts.isWithStatement(node)) hasDynamicCode = true;
      if (ts.isExportSpecifier(node)) {
        const name = node.propertyName ?? node.name;
        const sym = ts.isIdentifier(name) ? symbol(name) : checker.getSymbolAtLocation(name);
        if (sym) exportSymbols.add(sym);
      }
      if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name && ts.isIdentifier(node.name)) {
        const sym = symbol(node.name);
        if (sym) functions.set(sym, node);
        if (sym && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword)) exportSymbols.add(sym);
      }
      if (ts.isVariableStatement(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) { const sym = symbol(decl.name); if (sym) exportSymbols.add(sym); }
        }
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
        const props = new Map();
        let valid = ts.isVariableDeclarationList(node.parent) && !!(node.parent.flags & ts.NodeFlags.Const);
        // Client-visible global script bindings can be accessed by other scripts.
        const hasModuleSyntax = file.statements.some(s => ts.isImportDeclaration(s) || ts.isExportDeclaration(s) ||
          !!(ts.canHaveModifiers(s) && ts.getModifiers(s)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword)));
        if (!options.closedWorld && !hasModuleSyntax && /\.js$/i.test(file.fileName)) {
          /** @type {import('typescript').Node | undefined} */
          let ancestor = node.parent;
          while (ancestor && !ts.isSourceFile(ancestor) && !ts.isFunctionLike(ancestor)) ancestor = ancestor.parent;
          if (ancestor && ts.isSourceFile(ancestor)) valid = false;
        }
        for (const member of node.initializer.properties) {
          if (!ts.isPropertyAssignment(member) || (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name))) { valid = false; break; }
          const rhs = member.initializer;
          // Primitive data properties cannot invoke hidden `this`-dependent methods.
          if (!ts.isStringLiteral(rhs) && !ts.isNumericLiteral(rhs) &&
              !ts.isNoSubstitutionTemplateLiteral(rhs) &&
              rhs.kind !== ts.SyntaxKind.TrueKeyword && rhs.kind !== ts.SyntaxKind.FalseKeyword &&
              rhs.kind !== ts.SyntaxKind.NullKeyword && !ts.isBigIntLiteral(rhs) &&
              !(ts.isPrefixUnaryExpression(rhs) && ts.isNumericLiteral(rhs.operand) &&
                [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken].includes(rhs.operator))) valid = false;
          const key = /** @type {import('typescript').Identifier | import('typescript').StringLiteral} */ (member.name).text;
          if (key === '__proto__' || props.has(key)) { valid = false; break; }
          props.set(key, member);
        }
        if (valid && props.size) {
          const allocation = { filename: file.fileName, node: node.initializer, properties: props, blocked: new Set() };
          byLiteral.set(node.initializer, allocations.length);
          allocations.push(allocation);
        }
      }
    });
  }

  /** @returns {Value} */
  const empty = () => ({ ids: new Set(), unknown: false });
  /** @returns {Value} */
  const unknown = () => ({ ids: new Set(), unknown: true });
  /** @type {Map<import('typescript').Symbol, Value>} */
  const values = new Map();
  /** @type {Map<import('typescript').Symbol,Value>} */
  const returns = new Map();
  // A declared local binding starts at lattice bottom, before transfer functions run.
  for (const file of sources) visit(file, node => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && ts.isIdentifier(node.name)) {
      const s = symbol(node.name);
      if (s) values.set(s, empty());
    }
  });
  for (const s of functions.keys()) returns.set(s, empty());
  /** @param {Value} target @param {Value} next @returns {boolean} */
  function union(target, next) {
    let changed = next.unknown && !target.unknown;
    if (next.unknown) target.unknown = true;
    for (const id of next.ids) if (!target.ids.has(id)) { target.ids.add(id); changed = true; }
    return changed;
  }
  /** @param {Map<any,Value>} map @param {any} key @param {Value} next @returns {boolean} */
  function merge(map, key, next) {
    if (!key) return false;
    const prev = map.get(key) ?? empty();
    const changed = union(prev, next);
    map.set(key, prev);
    return changed;
  }
  /** @param {import('typescript').Expression} expr @returns {Value} */
  function value(expr) {
    if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isNonNullExpression(expr)) return value(expr.expression);
    if (ts.isObjectLiteralExpression(expr)) {
      const id = byLiteral.get(expr);
      if (id !== undefined) return {ids: new Set([id]),unknown:false};
    }
    if (ts.isIdentifier(expr)) { const s = symbol(expr); return s ? values.get(s) ?? unknown() : unknown(); }
    if (ts.isConditionalExpression(expr)) { const v = value(expr.whenTrue); union(v, value(expr.whenFalse)); return v; }
    if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
      const s = symbol(expr.expression);
      if (s && functions.has(s)) return returns.get(s) ?? unknown();
    }
    return unknown();
  }

  // The lattice only grows. This reaches a fixed point even for mutual recursion.
  let changed = true;
  for (let round = 0; changed && round < 2 * (allocations.length + 1) + 2 * (functions.size + 1) + 20; round++) {
    changed = false;
    for (const file of sources) {
      visit(file, node => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
          changed = merge(values, symbol(node.name), value(node.initializer)) || changed;
        }
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
          changed = merge(values, symbol(node.left), value(node.right)) || changed;
        }
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const fSym = symbol(node.expression);
          const f = fSym ? functions.get(fSym) : undefined;
          if (f) {
            f.parameters.forEach((param, i) => {
              if (ts.isIdentifier(param.name) && node.arguments[i]) {
                changed = merge(values, symbol(param.name), value(node.arguments[i])) || changed;
              }
            });
          }
        }
        if (ts.isReturnStatement(node) && node.expression) {
          let parent = node.parent;
          while (parent && !ts.isFunctionLike(parent)) parent = parent.parent;
          if (parent && parent.name && ts.isIdentifier(parent.name)) {
            changed = merge(returns, symbol(parent.name), value(node.expression)) || changed;
          }
        }
      });
    }
  }

  /** @param {import('typescript').Symbol | undefined} s */
  function externallyVisible(s) {
    if (options.closedWorld) return false;
    if (!s) return true;
    if (exportSymbols.has(s)) return true;
    return !!s?.declarations?.some(decl => {
      const sf = decl.getSourceFile();
      if (!/\.js$/i.test(sf.fileName)) return false;
      const moduleSyntax = sf.statements.some(st => ts.isImportDeclaration(st) || ts.isExportDeclaration(st) ||
        !!(ts.canHaveModifiers(st) && ts.getModifiers(st)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword)));
      if (moduleSyntax) return false;
      let p = decl.parent;
      while (p && !ts.isSourceFile(p)) {
        if (ts.isFunctionLike(p)) return false;
        p = p.parent;
      }
      return !!p;
    });
  }

  const untrusted = new Set([...functions.keys()].filter(externallyVisible));
  // JavaScript's implicit arguments alias and async/generator wrapping are
  // invisible to ordinary name/value-flow analysis.
  for (const [s, fn] of functions) {
    if (fn.asteriskToken || (ts.canHaveModifiers(fn) && ts.getModifiers(fn)?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword))) {
      untrusted.add(s);
    }
    if (fn.body) visit(fn.body, node => {
      if (ts.isIdentifier(node) && node.text === 'arguments') untrusted.add(s);
    });
  }
  // Direct calls are the only allowed uses of a trusted helper function.
  for (const file of sources) {
    visit(file, node => {
      if (!ts.isIdentifier(node)) return;
      const s = symbol(node);
      if (!s) return;
      const fn = functions.get(s);
      if (!fn) return;
      const parent = node.parent;
      if (fn.name === node || ts.isCallExpression(parent) && parent.expression === node ||
          ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return;
      untrusted.add(s);
    });
  }

  const blocked = new Set();
  /** @param {Value} v */
  function block(v) { for (const id of v.ids) blocked.add(id); }
  /** @param {import('typescript').Node} node @returns {import('typescript').Node} */
  function unwrap(node) {
    while (node.parent && (ts.isParenthesizedExpression(node.parent) || ts.isAsExpression(node.parent) || ts.isNonNullExpression(node.parent))) node = node.parent;
    return node;
  }
  /** @param {import('typescript').Node} node @param {Value} v */
  function checkUsage(node, v) {
    const outer = unwrap(node);
    const parent = outer.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === outer) return;
    if (ts.isElementAccessExpression(parent) && parent.expression === outer) return;
    if (ts.isVariableDeclaration(parent) && parent.initializer === outer && ts.isIdentifier(parent.name)) {
      if (externallyVisible(symbol(parent.name))) block(v);
      return;
    }
    if (ts.isBinaryExpression(parent) && parent.right === outer && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(parent.left)) {
      if (externallyVisible(symbol(parent.left))) block(v);
      return;
    }
    if (ts.isReturnStatement(parent) && parent.expression === outer) {
      let p = parent.parent;
      while (p && !ts.isFunctionLike(p)) p = p.parent;
      if (p && p.name && ts.isIdentifier(p.name)) {
        const s = symbol(p.name);
        if (s && functions.has(s) && !untrusted.has(s)) return;
      }
    }
    if (ts.isCallExpression(parent) && ts.isIdentifier(parent.expression)) {
      const index = parent.arguments.findIndex(arg => arg === outer);
      const s = symbol(parent.expression);
      const fn = s ? functions.get(s) : undefined;
      const formal = index >= 0 ? fn?.parameters[index] : undefined;
      if (s && !untrusted.has(s) && formal && ts.isIdentifier(formal.name) && !formal.dotDotDotToken) return;
    }
    block(v);
  }

  for (const file of sources) {
    visit(file, node => {
      if (ts.isDeleteExpression(node)) {
        // Deleting an own property can reveal a same-named prototype getter.
        // Renaming the deleted key would change the inherited lookup.
        /** @type {import('typescript').Expression} */
        let target = node.expression;
        while (ts.isParenthesizedExpression(target)) target = target.expression;
        if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
          block(value(target.expression));
        }
      }
      if (ts.isBinaryExpression(node) &&
          (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left)) &&
          node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
          !isStaticallyPrimitive(node.right)) {
        // A later function/object-valued write can observe its receiver through
        // `this` or custom coercion, so its property names must stay stable.
        block(value(node.left.expression));
      }
      if (ts.isIdentifier(node)) {
        const s = symbol(node);
        if (!s) return;
        const v = values.get(s);
        if (!v || !v.ids.size) return;
        if (ts.isVariableDeclaration(node.parent) && node.parent.name === node) {
          if (!options.closedWorld && exportSymbols.has(s)) block(v);
          return;
        }
        if (ts.isParameter(node.parent) && node.parent.name === node) return;
        if (ts.isImportSpecifier(node.parent) || ts.isImportClause(node.parent) || ts.isNamespaceImport(node.parent)) return;
        if (ts.isExportSpecifier(node.parent)) { if (!options.closedWorld) block(v); return; }
        checkUsage(node, v);
      }
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const receiver = value(node.expression);
        if (!receiver.ids.size) return;
        let key;
        if (ts.isPropertyAccessExpression(node)) key = node.name.text;
        else if (node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) key = node.argumentExpression.text;
        if (receiver.unknown || receiver.ids.size !== 1 || key === undefined) { block(receiver); return; }
        const id = [...receiver.ids][0];
        const allocation = allocations[id];
        if (!allocation.properties.has(key)) {
          // Unknown or inherited methods may reflect on the object's keys.
          blocked.add(id);
        }
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const s = symbol(node.expression);
        if (s && functions.has(s) && untrusted.has(s)) for (const arg of node.arguments) block(value(arg));
        // A direct helper may return the tracked object through a call result.
        // Its downstream use must also be proved. This catches implicit arrow
        // returns and assignment into unknown external object shapes.
        const returned = value(node);
        const outer = unwrap(node);
        if (returned.ids.size && !(ts.isExpressionStatement(outer.parent) && outer.parent.expression === outer)) {
          checkUsage(node, returned);
        }
      }
    });
  }

  // Namespace imports, dynamic imports, CommonJS interop and reexports can
  // observe exported object keys without any statically bound identifier.
  // The current checker only proves direct named import/export references.
  let indirectModuleAccess = false;
  for (const file of sources) visit(file, node => {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings &&
        ts.isNamespaceImport(node.importClause.namedBindings)) indirectModuleAccess = true;
    if (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          ts.isIdentifier(node.expression) && node.expression.text === 'require')) indirectModuleAccess = true;
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) indirectModuleAccess = true;
  });
  if (indirectModuleAccess) {
    for (const s of exportSymbols) block(values.get(s) ?? empty());
    diagnostics.push('Indirect module references found; exported property shapes preserved.');
  }

  if (hasDynamicCode) {
    blocked.clear();
    allocations.forEach((_, index) => blocked.add(index));
    diagnostics.push('Dynamic code generation was found; conservative property renaming disabled.');
  }
  const edits = new Map();
  /** @param {string} file @param {import('typescript').Node} node @param {string} replacement */
  function edit(file, node, replacement) {
    const sf = sources.find(s => s.fileName === file);
    const key = `${node.getStart(sf)}:${node.getEnd()}`;
    const f = edits.get(file) ?? new Map();
    if (f.has(key) && f.get(key).replacement !== replacement) throw new Error('Conflicting edit: ' + key);
    f.set(key, { start: node.getStart(sf), end: node.getEnd(), replacement });
    edits.set(file, f);
  }
  let renamed = 0;
  const renames = new Map();
  for (let id = 0; id < allocations.length; id++) {
    if (blocked.has(id)) continue;
    const allocation = allocations[id];
    const map = new Map();
    for (const [key, property] of allocation.properties) {
      const replacement = '_$' + crypto.createHash('sha256').update(`${seed}\u0000${allocation.filename}\u0000${allocation.node.pos}\u0000${key}`).digest('hex').slice(0, 14);
      if (allocation.properties.has(replacement)) continue;
      map.set(key, replacement);
      edit(allocation.filename, property.name, ts.isIdentifier(property.name) ? replacement : JSON.stringify(replacement));
      renamed++;
    }
    renames.set(id, map);
  }
  for (const file of sources) {
    visit(file, node => {
      if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return;
      const v = value(node.expression);
      if (v.unknown || v.ids.size !== 1) return;
      const id = [...v.ids][0];
      const map = renames.get(id);
      if (!map) return;
      if (ts.isPropertyAccessExpression(node)) {
        const replacement = map.get(node.name.text);
        if (replacement) edit(file.fileName, node.name, replacement);
      } else if (node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) {
        const replacement = map.get(node.argumentExpression.text);
        if (replacement) edit(file.fileName, node.argumentExpression, JSON.stringify(replacement));
      }
    });
  }
  /** @type {Record<string,string>} */
  const output = {};
  for (const [inputName, original] of entries) {
    const filename = path.posix.join(root, inputName.replace(/\\/g, '/'));
    const patches = [...(edits.get(filename)?.values() ?? [])].sort((a,b) => b.start-a.start);
    let updated = original;
    for (const p of patches) updated = updated.slice(0,p.start) + p.replacement + updated.slice(p.end);
    output[inputName] = updated;
  }
  diagnostics.push(`${allocations.length - blocked.size}/${allocations.length} closed object allocations eligible`);
  return { files: output, renamed, diagnostics };
}

module.exports = { transform };
