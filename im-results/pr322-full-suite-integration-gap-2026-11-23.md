# PR #322 full integration regression inventory, 23 November 2026

**Classification:** reproducible intermediate **correctness/test-positive-yield integration failure**, not a security benefit or new deployable release.

## Exact source pins and CI

- PR [#322](https://github.com/FlareZ123/obfs/pull/322), squash-merged executable source SHA `9d793f3f83e88059d9207702aa8dfdd9db16a8de`.
- [Postmerge complete Node validation 45109068605](https://github.com/FlareZ123/obfs/actions/runs/45109068605) **failed** Linux and Windows. Ubuntu compact harness recorded **4,977 tests: 4,917 pass, 58 fail, 2 skip**; Node typecheck and external typecheck passed, but positive-work benchmarks and browser positive-yield assertions also failed.
- [Expanded postmerge diagnostic 45109864345](https://github.com/FlareZ123/obfs/actions/runs/45109864345), test-runner limit raised branch-only from first 25 to first 75 failure blocks, confirms the list below.
- **Critical matched control:** exact premerge parent source `497a6fc41a937649638105bbeb091dfdf3fcd4f6`, [full validation 45109816374](https://github.com/FlareZ123/obfs/actions/runs/45109816374), passed Ubuntu and Windows. This supports attribution of new failures to PR #322's merged changes, not contemporaneous changes to main.
- The narrower exact postmerge [manual-transform-safety 45109064870](https://github.com/FlareZ123/obfs/actions/runs/45109064870) passed both OS, demonstrating that a green subset does not establish full main integration.

The merged compiler rejects transformations of local owner-property reads appearing in an exported or otherwise unproved callable because external consumers can observe exact function source with `Function.prototype.toString`. Many previously passing fixtures, samples, static-normalizer attack reports, and benchmarks asserted nonzero property-mutation counters inside such functions. These are likely **fixture proof-premise conflicts**; inspect each separately to distinguish legitimate lost transform yield, actual behavioral parity defects, static reconstruction expectations, and unrelated environmental failures. We have not demonstrated arbitrary-code parity or strong tamper resistance.

## All 58 Linux Node test failures

| # | Test file and line | Failing case |
|---:|---|---|
| 1 | `test/blob-constructor-alias-source-observer.test.js:97` | bound Blob constructor with primitive input retains private property rename |
| 2 | `test/blob-options-function-source-observer.test.js:78` | primitive Blob options preserve genuinely renamed private fields |
| 3 | `test/bound-native-constructor-source-observer.test.js:89` | bound native constructors with primitive arguments retain private-key renaming |
| 4 | `test/bound-runtime-interception.test.js:45` | hostile bind interception recovers actual private target source despite source-stable bound export |
| 5 | `test/bound-runtime-minifier-control.test.js:47` | same pre-import bind interception recovers private target from minified and obfuscated ESM |
| 6 | `test/esm-observation-matrix.test.js:18` | 576 real native/emitted ESM graphs preserve behavior across compiler modes |
| 7 | `test/esm-observation-session.test.js:7` | two protected ESM private fields preserve a 1-call and 2M-call cold/hot session |
| 8 | `test/factory-object-flow.test.js:183` | private ESM factory preserves two-file native Node execution |
| 9 | `test/fetch-constructor-function-source.test.js:102` | Fetch and File primitive inputs preserve private-key transformation: Response primitive body |
| 10 | `test/fetch-constructor-function-source.test.js:102` | Fetch and File primitive inputs preserve private-key transformation: Response primitive options |
| 11 | `test/fetch-constructor-function-source.test.js:102` | Fetch and File primitive inputs preserve private-key transformation: Response redirect primitive URL |
| 12 | `test/fetch-constructor-function-source.test.js:102` | Fetch and File primitive inputs preserve private-key transformation: Response redirect primitive alias |
| 13 | `test/fetch-constructor-function-source.test.js:102` | Fetch and File primitive inputs preserve private-key transformation: Request primitive URL |
| 14 | `test/fetch-constructor-function-source.test.js:102` | Fetch and File primitive inputs preserve private-key transformation: Request primitive options |
| 15 | `test/fetch-constructor-function-source.test.js:102` | Fetch and File primitive inputs preserve private-key transformation: File primitive parts |
| 16 | `test/fetch-constructor-function-source.test.js:102` | Fetch and File primitive inputs preserve private-key transformation: File primitive filename |
| 17 | `test/fetch-constructor-function-source.test.js:102` | Fetch and File primitive inputs preserve private-key transformation: Event primitive type |
| 18 | `test/fetch-constructor-function-source.test.js:102` | Fetch and File primitive inputs preserve private-key transformation: CustomEvent primitive type |
| 19 | `test/fetch-constructor-function-source.test.js:102` | Fetch and File primitive inputs preserve private-key transformation: MessageEvent primitive type |
| 20 | `test/fetch-constructor-function-source.test.js:102` | Fetch and File primitive inputs preserve private-key transformation: BroadcastChannel primitive name |
| 21 | `test/fetch-constructor-function-source.test.js:102` | Fetch and File primitive inputs preserve private-key transformation: TextDecoder primitive encoding |
| 22 | `test/fetch-constructor-function-source.test.js:102` | Fetch and File primitive inputs preserve private-key transformation: TextDecoderStream primitive encoding |
| 23 | `test/fetch-constructor-function-source.test.js:102` | Fetch and File primitive inputs preserve private-key transformation: CompressionStream primitive format |
| 24 | `test/fetch-constructor-function-source.test.js:102` | Fetch and File primitive inputs preserve private-key transformation: DecompressionStream primitive format |
| 25 | `test/function-declaration-reader-proof.test.js:64` | cross-module native ESM graph preserves direct named declaration reader calls |
| 26 | `test/function-declaration-reader-proof.test.js:141` | public-only source normalization retains a functional clone beside an ordinary minifier |
| 27 | `test/implicit-comparison-source.test.js:44` | strict equality with string never coerces function source and permits own-key renaming |
| 28 | `test/implicit-source-mode-matrix.test.js:57` | cross-module primitive-only logging does not suppress all transforms |
| 29 | `test/implicit-source-mode-matrix.test.js:76` | real multi-file ESM native and emitted console traces stay equivalent |
| 30 | `test/indirect-native-bind-source-observer.test.js:71` | primitive indirect-bound constructors allow provable private-key rewrites |
| 31 | `test/inline-bound-native-coercer-source.test.js:71` | proven primitive inline bound coercers preserve private field yield |
| 32 | `test/interfile.test.js:12` | four-file ESM dataflow preserves named imports, nested calls and external APIs |
| 33 | `test/object-from-entries-source-observation.test.js:42` | Map itself preserves function identity as key without source coercion |
| 34 | `test/private-class-source-yield.test.js:33` | coo private direct-use class preserves value and permits private owner rename |
| 35 | `test/private-class-source-yield.test.js:33` | sno private direct-use class preserves value and permits private owner rename |
| 36 | `test/private-record-grid.test.js:7` | all bounded private record slots preserve owner flow and remain source-only clonable |
| 37 | `test/private-record-proof.test.js:43` | private record slot forwards one owner through dot and bracket access in COO and SNO |
| 38 | `test/private-record-proof.test.js:101` | static independent attacker neutralizes all private record hashed labels |
| 39 | `test/private-record-proof.test.js:127` | private-record alias retains behavior in a two-module native ESM app |
| 40 | `test/private-record-proof.test.js:153` | experimental Symbol-key backend retains private tuple and record ownership proofs |
| 41 | `test/private-record-proof.test.js:198` | closed-world exported owner safely crosses ESM imports alongside a private record alias |
| 42 | `test/private-tuple-grid.test.js:6` | fixed primitive tuple owner flow: exhaustive bounded positions and independent source-only copy |
| 43 | `test/private-tuple-proof.test.js:43` | fixed private owner slot 0, 1, 2, 3 or 4 preserves native behavior in COO and SNO |
| 44 | `test/private-tuple-proof.test.js:101` | offline source-only property label recovery still succeeds for private tuple output |
| 45 | `test/private-tuple-proof.test.js:130` | two-file ESM application preserves indexed private tuple proof |
| 46 | `test/private-tuple-session.test.js:7` | private tuple end-to-end cold session measures compile, initialization and complete execution |
| 47 | `test/property-hotpath-closedworld.test.js:7` | closed-world hot ESM operations remain exact across three property-flow patterns |
| 48 | `test/property-key-source-observation.test.js:59` | Map object identity keys do not coerce function to source text |
| 49 | `test/sno-bound-runtime-interception.test.js:42` | SNO cannot conceal a nonconstructible bound private target from host before requiring entry |
| 50 | `test/source-stable-bound-export.test.js:25` | bound public export keeps native source and callable metadata while private primitive keys change |
| 51 | `test/symbol-key-static-recovery.test.js:28` | attacker also recovers private property accesses after ordinary identifier pass |
| 52 | `test/symbol-keys.test.js:24` | local Symbol keys preserve mutation and are generated only once |
| 53 | `test/symbol-keys.test.js:89` | real ESM two-file caller observes native values after local Symbol transformation |
| 54 | `test/symbol-keys.test.js:128` | generated before-and-after sample is byte-for-byte reproducible |
| 55 | `test/web-idl-record-source-observation.test.js:75` | recorded Web API primitive inputs leave unrelated keys eligible: record constructor |
| 56 | `test/web-idl-record-source-observation.test.js:75` | recorded Web API primitive inputs leave unrelated keys eligible: record property alias |
| 57 | `test/web-idl-record-source-observation.test.js:75` | recorded Web API primitive inputs leave unrelated keys eligible: record redirect |
| 58 | `test/web-idl-record-source-observation.test.js:75` | recorded Web API primitive inputs leave unrelated keys eligible: record redirect alias |

**Concentration:** `test/fetch-constructor-function-source.test.js` (16), `test/private-record-proof.test.js` (5), `test/web-idl-record-source-observation.test.js` (4), `test/private-tuple-proof.test.js` (3), `test/symbol-keys.test.js` (3), `test/function-declaration-reader-proof.test.js` (2), `test/implicit-source-mode-matrix.test.js` (2), `test/private-class-source-yield.test.js` (2), `test/blob-constructor-alias-source-observer.test.js` (1), `test/blob-options-function-source-observer.test.js` (1), `test/bound-native-constructor-source-observer.test.js` (1), `test/bound-runtime-interception.test.js` (1), `test/bound-runtime-minifier-control.test.js` (1), `test/esm-observation-matrix.test.js` (1), `test/esm-observation-session.test.js` (1), `test/factory-object-flow.test.js` (1), `test/implicit-comparison-source.test.js` (1), `test/indirect-native-bind-source-observer.test.js` (1), `test/inline-bound-native-coercer-source.test.js` (1), `test/interfile.test.js` (1), `test/object-from-entries-source-observation.test.js` (1), `test/private-record-grid.test.js` (1), `test/private-tuple-grid.test.js` (1), `test/private-tuple-session.test.js` (1), `test/property-hotpath-closedworld.test.js` (1), `test/property-key-source-observation.test.js` (1), `test/sno-bound-runtime-interception.test.js` (1), `test/source-stable-bound-export.test.js` (1), `test/symbol-key-static-recovery.test.js` (1).

## Remediation principle

Do not silence a genuine source-parity veto to force higher transformation counters: observe a public callable's `toString` before claiming its body may be rewritten. Where the objective is to test a truly private field, preserve its separate local proof using a nonexported uniquely-bound direct-call-only helper; have the exported public function invoke that helper. Retain a negative exported-callable source assertion. Direct strict-module arrow IIFEs may admit a separate bounded proof, **but sloppy arrows can be recovered through legacy `Function#caller`**, so no blanket direct-IIFE exception is valid. Recheck all compiler changes on the full source-pinned matrix and compare against the premerge control; do not infer overall release green from limited tests.

The global strong security release remains blocked independently of this integration problem.
