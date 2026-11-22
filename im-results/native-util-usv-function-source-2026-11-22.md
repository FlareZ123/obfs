# Node util.toUSVString callable source coercion (22 November 2026)

**Status:** Source-pinned two-platform RED/GREEN clean-runtime compatibility finding. The separate full integration result is pending. **Mode scope:** COO, SCO, SNO native Node 22 JavaScript.

## Observation

The Node builtin `util.toUSVString(value)` exposes an exact `Function.prototype.toString` representation when passed a callable, despite having no explicit JS source-inspection syntax at the callsite. This follows from the observed Node 22 runtime behavior; Node's API documentation declares a string input, so actual non-string coercion should be treated as an empirical runtime behavior, not a contractual documented guarantee.

In unprotected source, `function nativeUsvSourceFunction(){return 'UNTRANSFORMED_USV_FUNCTION_BODY_20261122';}` stringifies to its exact declared body. Before the repair, the compiler replaced the literal with an obfuscated table read inside the same callable. The native method then returned the transformed function body, violating output parity.

## Reproducible evidence

- **RED:** [45059483882](https://github.com/FlareZ123/obfs/actions/runs/45059483882) on exact `67cbb37ac83080ff11e3b4298cf84ad6cff9e6e0`, Node 22 Ubuntu and Windows. Direct `require('node:util').toUSVString(fn)`, namespace/alias, destructured/detached, and ESM named/default imports had native-output discrepancies or `observesFunctionSource(...)=false`. Logs show exact public string before and after `_o...` literal-table rewriting.
- **Initial GREEN:** [45059599473](https://github.com/FlareZ123/obfs/actions/runs/45059599473) at `d87fdb0ed85672284ba98e6031f8c89257461ee3` for the original Node 22 two-platform corpus and strict project/external JSDoc. The existing util namespace/method alias proof was extended with a source-coercion condition.
- **Adversarial alias RED:** [45059661040](https://github.com/FlareZ123/obfs/actions/runs/45059661040) at `9a97d700da73dfd32969e0c164d8e7f8999185a1`: `Reflect.apply` and object destructuring with a default method initializer still changed exact native output. Both operating systems reproduced the mismatch.
- **Expanded GREEN:** [45059762681](https://github.com/FlareZ123/obfs/actions/runs/45059762681) at `b525fd2533bd0f706ee3df227dc5a4e57ba342d3`: native CJS/ESM, computed key, default destructuring, direct `call`/`apply`/`bind`, `Reflect.apply` and positive primitive tests passed on Node 22 Ubuntu/Windows with strict JSDoc.

The positive test shows ordinary `util.toUSVString('plain-value')` remains transform-eligible and that safe literal encryption still produces nonzero compiler metrics.

## Conservative fix

The branch `agent2-node-util-usv-source-parity-20261122` extends the existing `nodeUtilMethod` provenance inference in `src/ast.js`. It recognizes `toUSVString` on the exact `node:util`/`util` builtin, including named ESM exports, namespace/default ESM imports and direct CommonJS imports; follows known method aliases; and conservatively treats unknown computed selectors on the native namespace as potentially calling the source-coercing method. It checks unproved function-valued input positions across direct, bound, `call`/`apply` and `Reflect.apply` forms. Object destructuring accepts default-initializer aliases.

## Boundaries

This only improves clean-runtime behavior preservation of selected code. No hostile-runtime tamper-resistance, offline source secrecy, source reconstruction resistance or universal 2.5x compute guarantee follows. Untyped dynamic module imports, arbitrary host-patched methods, and opaque unknown helpers remain outside the demonstrated provenance set. The project's primary strong-protection verdict remains **RELEASE-BLOCKED**.

Official Node documentation: https://nodejs.org/download/release/latest-jod/docs/api/util.html#utiltousvstringstring .
