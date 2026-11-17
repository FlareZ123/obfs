# Native String/RegExp destructuring retains function-source semantics

**Status:** bounded semantic-compatibility repair, 17 November 2026.
This is intermediate engineering evidence, not runtime hardening, general
program equivalence, strong static resistance, or a 2.5× guarantee.

## The escape path

Native builtins can stringify a protected function when invoked through
a detached method that was **destructured** from a constructor or
prototype. For example:

```js
function f(a) { return a ^ 17; }
const {test: check} = RegExp.prototype;
const exposed = check.call(/a\^17/, f);
```

The native regular expression sees the original function source. An
opt-in WebAssembly rewriting pass must conservatively decline it even
when numeric outputs of the protected function would remain equivalent.

Other observed paths include `const {raw}=String`,
`const {[Symbol.match]: matcher}=RegExp.prototype`, and
`const {[Symbol.iterator]: iter}=String.prototype`.
The source observer fixed-point formerly recognized direct member
captures and aliases, while not deriving corresponding identities
through `ObjectPattern` destructuring.

## Pinned differential

- A broader [full integration run 44005360926](https://github.com/FlareZ123/obfs/actions/runs/44005360926)
  at `28e3e507` surfaced the two independent native-method
  destructuring failures. The same run also failed a separate
  `fixed-arity-strings.test.js` file-level parse error.
- [Targeted red 44007193848](https://github.com/FlareZ123/obfs/actions/runs/44007193848)
  at `f3c625c6`: **12/14 tests passed**, **2 failures** on
  each of Ubuntu and Windows. The corrected fixed-arity decoder test
  parsed and passed here; the two native source-observer cases still
  failed as expected.
- `src/ast.js` change
  [9bd4da3](https://github.com/FlareZ123/obfs/commit/9bd4da3ad5109e24fca3ca7263c59db492393112)
  tracks destructured RegExp text-consuming and symbol methods, generic
  native String receiver methods, its native iterator, and `String.raw`.
  It marks their aliases in the same conservative source-observer
  fixed point as direct native member references.
- [Targeted green 44007358725](https://github.com/FlareZ123/obfs/actions/runs/44007358725)
  at `9bd4da3`: all **14/14 tests** and strict JSDoc
  passed on both operating systems.
- `test/fixed-arity-strings.test.js` parse repair
  [33fe8e2](https://github.com/FlareZ123/obfs/commit/33fe8e2fbd6c880adff3b72b71095b6be079b52c)
  corrected a doubly escaped open parenthesis in a standalone regex
  assertion. This is a test-harness repair, independently of the
  compiler's source semantics.

Reproduce with `.github/workflows/manual-source-destructuring.yml`,
which runs the RegExp, String.raw/iterator and fixed-arity test files
under Node 22 on Windows/Linux followed by `npm run typecheck`.

## Remaining proof boundaries

Only direct, statically named native constructors/prototypes and known
symbol aliases are covered. Aliased constructors, namespace-generated
method owners, complex destructuring, arbitrary `Reflect.get` and
custom native-like objects require independent provenance proofs.
Names may be shadowed, and the current guard may conservatively
refuse otherwise safe transformations. Positive primitive-only
controls in the original RegExp/String test files remain in the
targeted gate. No independent attacker resistance, runtime overhead
bound or production browser compatibility is established by these
tests.
