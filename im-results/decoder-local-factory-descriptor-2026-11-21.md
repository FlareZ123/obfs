# Decoder parity through locally returned getter descriptor maps

**21 November 2026, Agent 3. Intermediate source-pinned compatibility evidence.** The broader strong-obfuscation release decision remains **RELEASE-BLOCKED**.

## Native/emitted counterexample

A CommonJS `mutator.cjs` is required before `target.cjs` exports a long string. The mutator constructs a native accessor whose getter exposes the shared string intrinsic, but obtains its descriptor map from a local synchronous function:

```js
const desc={get(){return String.prototype;}};
function make(){return {ref:desc};}
const box=Object.create(null,make());
box.ref.charCodeAt=()=>0;
```

The original `target.cjs` prints the literal. The emitted long-string decoder calls `raw.charCodeAt` and emits incorrect text after the earlier intrinsic mutation unless this file group declines string encoding. Replacing the native sink with `const box={};Object.defineProperties(box,make());` produces the same issue. A variant returns a local aliased map `const m={ref:desc};return m;`.

Test `test/decoder-descriptor-factory-return.test.js` supplies 16 exact native/emitted process comparisons: four function-return shapes × COO/SNO × harmful String and harmless Number prototype writes. It also requires literal transformation to remain enabled for each harmless Number control.

## Source-pinned evidence

| Gate | Exact source SHA | Ubuntu Node 22 | Windows Node 22 |
| --- | --- | --- | --- |
| Test-only red | `c91945716bd3bb18305377431b4867fe68fe9ed9` | 4,098 pass, 8 fail, 1 skip / 4,107 | 4,095 pass, 8 fail, 4 skip / 4,107 |
| Guarded green | `de1e606a4764005a43d18dc52535ca478f31ef65` | 4,132 pass, 0 fail, 1 skip / 4,133 | 4,129 pass, 0 fail, 4 skip / 4,133 |

- [Red full two-platform CI 44936617069](https://github.com/FlareZ123/obfs/actions/runs/44936617069): exactly eight new harmful-String behavioral failures, same cases on Ubuntu and Windows; all eight Number controls passed.
- [Green full two-platform CI 44937176639](https://github.com/FlareZ123/obfs/actions/runs/44937176639): zero behavioral failures across the expanded combined suite, successful strict JSDoc and external typecheck, benchmark and paired process profiles, and Ubuntu Chromium integrations.

The bounded compiler repair in `src/core.js::mutatesDecoderIntrinsic` retains the earlier local descriptor/map fixed-point summaries, adds a finite set of synchronous getter-map factories, associates direct returns of sensitive descriptor maps with local function declarations, recognizes factory calls supplying descriptor maps, and refuses the generated eager decoder on unsafe native `Object.create`/`Object.defineProperties` sinks.

The candidate and its tests are preserved in [draft PR #217](https://github.com/FlareZ123/obfs/pull/217); the original test-only red branch is `agent3/descriptor-factory-interprocedural-20261121`. This does not establish arbitrary higher-order or cross-module factory provenance. A distinct cross-module CommonJS export matrix subsequently produced independent failures and is being investigated separately.

This is compatibility correctness under native execution parity, without a security strength or universal 2.5× performance conclusion.
