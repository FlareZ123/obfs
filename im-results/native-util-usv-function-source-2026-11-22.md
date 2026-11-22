# Node util native callable-source coercion: toUSVString and MIMEType (22 November 2026)

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

## Additional native MIMEType caught-error observer

The Node `util.MIMEType` constructor documents string coercion of its argument, and the invalid-MIME TypeError contains the coerced input's text. When passed a function, the caught error message includes the full original callable source. Rewriting a string literal inside that function changes a normal, caught exception message even if the program never explicitly requests `Function.prototype.toString`.

- **MIME TypeError RED:** [45060263606](https://github.com/FlareZ123/obfs/actions/runs/45060263606) at `b6300761b5fd3c1f2f70af1557bc2f658696187d` on Node 22 Ubuntu/Windows. Direct/aliased, computed/destructured, ESM named and `Reflect.construct` calls transformed a `PRIVATE_MIME_SOURCE_MARKER_20261122` function body into a decoder-table lookup in the emitted TypeError message.
- **MIME TypeError GREEN:** [45060559615](https://github.com/FlareZ123/obfs/actions/runs/45060559615) at `9df7892f737d7f1837eda13e75528207ccb0d57d`, Node 22 Ubuntu/Windows and both strict JSDoc suites.
- **Expanded MIME coercer GREEN:** [45060683743](https://github.com/FlareZ123/obfs/actions/runs/45060683743) at `e8c61aec8ba3e2d4fe3c3ff30d3499db2af513af`, adding bound constructor, defaulted destructuring, unknown computed destructuring and aliased `Reflect.construct`. Primitive valid MIME inputs remain rewrite-eligible with positive `literals>0` metrics.

The branch extends the same `nodeUtilMethod` native-module method and constructor alias analysis for `MIMEType`, including the preexisting `constructObservesSource` helper for reflective construction. This is a clean-runtime observable diagnostic parity fix, with no claim that caught errors are secrecy protection.

Official Node 22 documentation: https://nodejs.org/download/release/latest-jod/docs/api/util.html#new-mimetypeinput .

## Conservative fix

The branch `agent2-node-util-usv-source-parity-20261122` extends the existing `nodeUtilMethod` provenance inference in `src/ast.js`. It recognizes `toUSVString` and the `MIMEType` constructor on the exact `node:util`/`util` builtin, including named ESM exports, namespace/default ESM imports and direct CommonJS imports; follows known method aliases; and conservatively treats unknown computed selectors on the native namespace as potentially selecting either source-coercing method or constructor. It checks unproved function-valued input positions across direct, bound, `call`/`apply`, `Reflect.apply`, native construction and `Reflect.construct`. Object destructuring accepts default-initializer aliases.

## Boundaries

This only improves clean-runtime behavior preservation of selected code. No hostile-runtime tamper-resistance, offline source secrecy, source reconstruction resistance or universal 2.5x compute guarantee follows. Untyped dynamic module imports, arbitrary host-patched methods, and opaque unknown helpers remain outside the demonstrated provenance set. The project's primary strong-protection verdict remains **RELEASE-BLOCKED**.

Official Node documentation: https://nodejs.org/download/release/latest-jod/docs/api/util.html#utiltousvstringstring .

## Same-file private-literal yield limit

A direct `util.toUSVString` observer of one local function was paired in the same CJS file with a distinct immutable private literal, with native-versus-emitted output parity and `rewrittenLiterals` logged per mode. [Node 22 Ubuntu/Windows focused run 45060999914](https://github.com/FlareZ123/obfs/actions/runs/45060999914) at `d0ec35f92a6d4f4508e8f919ca6c265e78d56c04` passed and reported **zero rewritten literals for COO, SNO and SCO**. The current conservative guard preserves source semantics at the cost of failing to rewrite even the unrelated private literal. The other positive control with only primitive `util.toUSVString('plain-value')` still has nonzero literal yield. This distinction is a documented protection-yield cost; any selective rewrite needs an independent bounded source-range proof and Agent 3's cross-pass integration review.

## MIMEType setter and MIMEParams native source coercion

Node 22's builtin `MIMEType.type` / `MIMEType.subtype` setters perform native string conversion and can put the original function body in a caught invalid MIME TypeError. Separately `MIMEParams.set(name,value)` can convert a function name or value to its exact source text, which is recoverable via `params.get(name)` without invoking JavaScript `.toString()` at the callsite. Node 22 runtime confirmed that direct `params.get('label')` returns exactly `Function.prototype.toString.call(functionOperand)` for the stored callable.

- [Source-pinned Node 22 Ubuntu/Windows **RED** 45061663866](https://github.com/FlareZ123/obfs/actions/runs/45061663866) at `8d6c6b1c530f2e00a6a506f299455476fd25ed15` reproduces changed error messages for native `mime.type=fn` and `mime.subtype=fn` in all three compiler modes. The earlier fixture contained a generic `.toString()` output on some `MIMEParams` paths, masking their separate source-observer behavior; those tests were corrected to read the coerced value with `.get('label')`.
- [Expanded focused Node 22 Ubuntu/Windows **GREEN** 45061976761](https://github.com/FlareZ123/obfs/actions/runs/45061976761) at `e3bb36581210554fd259689b547807d344ea78c0` passes native `MIMEParams` direct construction, `MIMEType.params` values and detached aliases, native `set.call`, ESM native named constructor, both setter diagnostics, and primitive-only private-literal yield for COO, SNO and SCO.

The conservative implementation records literal Node `util` namespace methods `MIMEParams` and `MIMEType`, follows bounded instance and `.params` aliases, and treats unproved inputs to native `set`, `get`, `has`, `delete` and direct `.type`/`.subtype` property writes as source observable. It also handles bounded direct `.call`, `.apply`, `.bind` and `Reflect.apply` on native MIME parameter methods. This remains a limited syntactic provenance proof. Dynamic helper forwarding and host-replaced prototypes are outside the tested claim; code bytes visible through arbitrary external importers remain a separate contract.

The source-pinned [full Node+Chromium two-platform integration **GREEN** 45061263832](https://github.com/FlareZ123/obfs/actions/runs/45061263832) at `d0ec35f92a6d4f4508e8f919ca6c265e78d56c04` covers the earlier native util and MIMEType constructor candidate plus same-file zero-yield controls, but **predates** MIMEParams and setter changes. The final combined candidate must pass its own full integration and strict external JSDoc at one exact source.

## Reflective MIMEType setter bypass and repair

A held-out two-platform fixture reproduced the same source-spelling leak through native reflective writes. `Reflect.set(mime,'type',fn)` and `Object.assign(mime,{subtype:fn})` invoke native MIMEType prototype setters, and the caught TypeError embeds the original `fn` source. The pre-repair compiler transformed a string literal inside the callable and changed the diagnostic.

- **RED:** [Node 22 Ubuntu/Windows run 45062314950](https://github.com/FlareZ123/obfs/actions/runs/45062314950) at `7cce1b6bec368b80e730a7092d77137c7ee03431`, all COO/SNO/SCO modes; native error message contains the original function's `PRIVATE_MIME_PARAMS_BODY_20261122` literal, generated message contains a rewritten table lookup.
- **GREEN:** [Node 22 Ubuntu/Windows focused run 45062393683](https://github.com/FlareZ123/obfs/actions/runs/45062393683) at `bda21e07353e59756d48bd163607eec50526d94d`; all expanded CJS/ESM, MIMEParams, MIMEType setter and primitive-positive controls pass, as do strict project/external JSDoc checks (the focused workflow includes both).

The bounded fix uses the existing trusted reflective receiver provenance to recognize native target MIMEType objects, `Reflect.set` writes to type/subtype with unproved values, and `Object.assign` copying possibly coercible fields into those setters. It preserves source conservatively when the source object's relevant field cannot be proven primitive. Arbitrary reflected setter aliases, imported mutable host objects and unsupported cross-file source consumers remain outside the demonstrated set.

The previously green full [45062160168](https://github.com/FlareZ123/obfs/actions/runs/45062160168) predates this repair. A full Node+Chromium replay on the final source is still required before a combined integration assertion.

## Computed MIMEType.params alias and bounded native method calls

The next held-out test selected the MIME parameter object through a variable key, `const key='params'; const params=mime[key]`, and then passed a source-bearing function to `params.set('label',fn)`. Because the original provenance check required literal `.params`, the generated output changed the exact value obtained through `params.get('label')`.

- **RED:** [Node22 Ubuntu/Windows focused run 45062716117](https://github.com/FlareZ123/obfs/actions/runs/45062716117), SHA `a0d281f2a019ea8d3a9192420a2719a4708ab3b6`; all three modes changed the original function source to a decoder-table lookup despite native result string requiring exact text. The independent control for primitive MIME parameter values continued to pass with nonzero transform yield.
- **GREEN:** [Node22 Ubuntu/Windows focused run 45062825376](https://github.com/FlareZ123/obfs/actions/runs/45062825376), SHA `9442d4e3a4dd75abb1a8e9fcc7fbd3c3054041fb`; static and dynamic parameter member access, native CJS/ESM, destructuring, `Reflect.apply` and bound setter invocations, setter diagnostics, primitive-positive controls and strict project/external JSDoc pass.

The repair treats a computed member selector on a proven native MIMEType instance whose key cannot be statically resolved as *possibly selecting* `params`. Unknown selectors trigger conservative source preservation only when the resulting object and method usage can observe an unproved value. This is more accurate than assuming dynamic `mime[key]` accesses are safe. The tests do not establish a complete native capability provenance proof under arbitrary user-defined wrappers or modified prototypes.
