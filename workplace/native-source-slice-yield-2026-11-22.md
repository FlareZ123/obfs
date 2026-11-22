# Bounded native-function-source visibility and same-file private-yield plan

**Agent:** 2. **Date:** 22 November 2026. **Status:** research proposal and reproducible regression inventory, **not** a production safety proof or an independent integration branch.

## Why this matters

The compiler recognizes many native APIs that coerce a JavaScript function to its exact source spelling. The current correct fallback refuses all string-literal rewriting for a file containing one recognized function-source observation. Source-pinned Node 22 tests demonstrate the cost: unrelated immutable private string literals remained untransformed, even though the native result depended only on a different function's lexical body.

- `querystring.escape(fn)` observer plus unrelated private CJS literal: [run 45060995323](https://github.com/FlareZ123/obfs/actions/runs/45060995323), exact SHA `55e0c1e72a4429c63561bf758f584f95a373a3f3`, source parity and `rewrittenLiterals:0` in all three modes on Ubuntu/Windows.
- `util.toUSVString(fn)` observer plus unrelated private CJS literal: [run 45060999914](https://github.com/FlareZ123/obfs/actions/runs/45060999914), exact SHA `d0ec35f92a6d4f4508e8f919ca6c265e78d56c04`, same result.
- Native MIMEType invalid diagnostics [run 45060263606](https://github.com/FlareZ123/obfs/actions/runs/45060263606) and MIMEParams/source-setter focused repairs [run 45061976761](https://github.com/FlareZ123/obfs/actions/runs/45061976761) establish further observer classes.

The exact guard is `encodeStrings(...)` in `src/strings.js`, which immediately returns `count:0` when `observesFunctionSource(ast)` is true. A separate group-wide veto exists in `src/core.js` (`remoteSourceObserver`, `shouldEncodeStrings`, and identifier/property gates). This makes the issue **cross-pass and cross-file** rather than one native API special case. Agent 3 is the reconciled sole owner of the canonical source contract and integration branch. This proposal is evidence for that work, with no competing merge path.

## Minimal constructive hypothesis

Consider a single CJS module whose top-level function `publicFn` has an immutable source body and is passed only to a statically resolved native source-coercing method:

```js
function publicFn() { return 'PUBLIC_FUNCTION_BODY'; }
const privateData = 'PRIVATE_OUTSIDE_FUNCTION_BODY';
const qs = require('node:querystring');
module.exports = { observed: qs.escape(publicFn), value: privateData };
```

Changing the initializer of `privateData` to a semantically equivalent reconstructed string **outside** `publicFn`'s byte range does not alter the text returned by `Function.prototype.toString.call(publicFn)` or `qs.escape(publicFn)`, assuming the native intrinsics and module capabilities remain trusted and no other source or source-coordinate observers exist. The actual obfuscator currently refuses this transformation. A hand-constructed bounded counterfactual now verifies existence for one fixture: [Node22 Ubuntu/Windows focused run 45062630523](https://github.com/FlareZ123/obfs/actions/runs/45062630523) at `658e105e5809401f3cca2e1965b3e0eec15265fa` runs the untouched and manually rewritten CJS source under the real native `querystring.escape`, asserts exact exported-value and encoded-function-source equality, and confirms that the private literal is absent verbatim from the rewritten source. The test lives in `test/node-querystring-escape-source.test.js` on draft evidence PR #296 and **does not change the production obfuscator**. This is a **bounded executable feasibility witness** for that fixture. It does not prove arbitrary-realm safety, general transformed-library correctness, confidentiality or the 2.5x CPU limit.

## Proposed admission proof and rejection conditions

1. Build an AST interval ledger for source-observable callables, classes and nested bodies. Include all function values reachable by native `String` coercion, reflection, exported callables observed by importers, potential opaque callback forwarding, and computed method selectors whose safety cannot be established. Capture exact source slices from input bytes before any pass.
2. Lock the entire nested source interval of every possibly observed function, including default parameters, decorators, lexical method spellings, class initializer text, and embedded strings. Freeze all observable identifier and property spellings used by these intervals; handle references crossing a locked boundary conservatively.
3. Reject the selective exception if source-byte integrity, HTML SRI, `fs`/loader source readers, `Error.stack`/source-coordinate readers, eval-like code acquisition, untrusted mutable intrinsics, unresolved imports, nonlocal callable escape, or uncertain alias provenance may expose changed bytes outside the intervals. The current broad refusal remains the correct fallback for these cases.
4. Transform only expressions with a *separately proved* non-observable source interval, initially private top-level immutable literal initializers in single-file Node CJS with a closed, known native-observer call. Ensure helper insertions cannot shadow bindings, conflict with directives, alter TDZ/import cycles, leak into locked functions or change platform exceptions.
5. Run native-versus-emitted outputs **and** exact `Function.prototype.toString` through importers, then require a matched positive `rewrittenLiterals>0` from the same file. Evaluate string/identifier/property/control-flow passes independently and in combination under COO/SNO/SCO, Node22 Ubuntu/Windows and real Chromium where applicable. Measure startup and hot-path CPU against the independent 2.5x budget; do not reinterpret startup exemptions for client-side SCO or COO.

The crucial distinction is between **a syntactically recognized source observer** and **the range of bytes it can actually observe**. Current tests justify source preservation. They do not yet justify any selective admitted range for arbitrary JS.

## Integration

Port only independently reviewed proofs and regression fixtures into Agent 3's canonical `agent3/object-create-descriptor-group-guard-20261122` integration. Preserve the original red witnesses and source pins in the two Agent 2 draft PRs [#296](https://github.com/FlareZ123/obfs/pull/296) / [#298](https://github.com/FlareZ123/obfs/pull/298). Retain **RELEASE-BLOCKED** for strong confidentiality, tamper resistance and universal 2.5x performance.
