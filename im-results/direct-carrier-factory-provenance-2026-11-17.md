# Direct Set/Map carrier-factory source observers (provisional)

**17 November 2026. Status:** implementation and adversarial controls
committed; the corresponding GitHub Actions jobs were still **queued**
at 03:22 UTC during an Actions service disruption. This is intermediate
work in `im-results/`, not an established result and not a green claim.

## Observational failure candidate

A source-changing transformation may preserve `f(x)` while changing
its exact native `Function#toString`. A direct helper can place `f`
inside an iterable that callers stringify:

```js
function f(x){return x^17;}
function carry(value){return new Set([value]);}
module.exports=[...carry(f)].join(",");
```

The native output includes `function f(x)`. The provenance requires
tracking a formal parameter through a return-time `new Set([...])`,
then back to a particular call argument. A `Map` carrying `f`
in its values is equivalent for this purpose. These examples were
verified for native source-observation semantics in Node 22, while the
obfuscator decline still needs a completed pinned CI run.

## Bounded implementation

`src/ast.js` exports `collectDirectCarrierFactories(ast)`, which
gathers direct `FunctionDeclaration`, `FunctionExpression` and
`ArrowFunctionExpression` returns of a `new Set` or `new Map`
whose constructor arguments syntactically mention the function's
formal parameter. It records the corresponding argument positions.
A monotone alias closure follows simple local
`const alias=factory` assignments. Defaulted formal parameters add
a conservative may-source flag, because an omitted or undefined
argument can select a function-bearing default. These are
**overapproximations**, deliberately refusing some safe transforms
rather than treating unknown values as proven harmless.

The local source-observer fixed point consults these relationships
for direct calls. The ESM export collector in
`src/cross-properties.js` reuses the same AST helper. The
implementation does not claim that arbitrary helper functions,
higher-order returns, indirect imports, computed reflective method
calls, or dynamically rebound constructors are fully traced.

## Reproduction and current status

- Red-control additions:
  `test/iterable-function-source.test.js` and
  `test/cross-file-iterable-source.test.js`.
  They cover direct Set/Map returns, arrow factories, aliases and
  defaulted parameters. Primitive-only call sites provide
  transformations-must-still-run positive controls.
- New helpers committed:
  [50754ce](https://github.com/FlareZ123/obfs/commit/50754cefcf44704d536ac11637e4fe6a4dc7e2e7),
  [ff77f5d](https://github.com/FlareZ123/obfs/commit/ff77f5d9a204b3a08756059c4789d4bfe90863ed),
  [88a52c8](https://github.com/FlareZ123/obfs/commit/88a52c81af0f2e61f6a86dbc0cd5bd9d363f36f8),
  and alias/default closure
  [293e6c6](https://github.com/FlareZ123/obfs/commit/293e6c69a299ca2222d02b28222f5528ba144e87),
  [a939b9c](https://github.com/FlareZ123/obfs/commit/a939b9c770a6d648d953df49790051c53a61a807).
- Pinned but **unverified** manual runs:
  [44008942356](https://github.com/FlareZ123/obfs/actions/runs/44008942356)
  at `30133e9` for direct-factory red controls,
  [44009267985](https://github.com/FlareZ123/obfs/actions/runs/44009267985)
  at `88a52c8` for the initial direct-factory patch, and
  [44009605233](https://github.com/FlareZ123/obfs/actions/runs/44009605233)
  at `a939b9c` for alias/default handling.
- All three use
  `.github/workflows/manual-array-source-coercion.yml`, Node 22
  on Windows and Ubuntu with strict JSDoc. **No verdict should be
  recorded until each job finishes and its exact SHA is checked.**

This intermediate work broadens static source-consistency checks.
It has no proven effect on extraction resistance, operational server
secrets, authorized-only execution, or the universal 2.5× budget.
