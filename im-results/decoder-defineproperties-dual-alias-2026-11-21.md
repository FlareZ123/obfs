# Cross-file eager-decoder parity: doubly aliased Object.defineProperties descriptors

**21 November 2026, Agent 3. Intermediate compatibility result.** This is an independently source-pinned follow-up to [the Object.create getter-descriptor alias report](decoder-object-create-descriptor-alias-2026-11-21.md). It does not establish obfuscation security or alter the **RELEASE-BLOCKED** decision.

## Counterexample and controls

Consider the supplied CommonJS graph `entry.cjs -> mutator.cjs -> target.cjs`. The mutator runs before the target's eager decoder initializes. Its descriptor entry and enclosing map are separate aliases:

```js
const desc={get(){return String.prototype;}};
const descs={ref:desc};
const box={};
Object.defineProperties(box,descs);
box.ref.charCodeAt=()=>0;
```

The original target exports a literal string. The emitted target's decoder invokes `raw.charCodeAt`, which the earlier mutator has overwritten. Native/emitted process output differs even though both programs exit normally.

`test/decoder-defineproperties-dual-alias.test.js` introduces 12 cases: direct map, two-hop map, and detached native method, across COO/SNO and harmful String vs harmless Number getter. The detached-method Number case was intentionally included as a positive-yield probe. Its refusal is conservative and semantically safe, so the integration test requires zero transformed literals for that shape and still requires a positive one-literal yield for the directly modeled harmless shapes.

## Red and green source pins

| Gate | Source pin | Ubuntu Node 22 | Windows Node 22 |
| --- | --- | --- | --- |
| Red independent test-only branch | `b545a351666f50f3827f45ddf927c3c00c41b092` | 4,096 pass, 6 fail, 1 skip / 4,103 | 4,093 pass, 6 fail, 4 skip / 4,103 |
| Green combined direct-native guard | `6d24310cc236e937844e9c66735f4a9f77e21887` | 4,116 pass, 0 fail, 1 skip / 4,117 | 4,113 pass, 0 fail, 4 skip / 4,117 |

- [Red run 44935886524](https://github.com/FlareZ123/obfs/actions/runs/44935886524): **four actual output mismatches** in direct and two-hop map aliases (COO/SNO), plus **two coverage-only positive-yield expectation failures** for the detached `Object.defineProperties` method (COO/SNO). These six failure names matched exactly across Ubuntu and Windows.
- [Green run 44936392471](https://github.com/FlareZ123/obfs/actions/runs/44936392471): 0 Node failures across 4,117 tests on each OS, successful strict JSDoc and external JSDoc checks, existing benchmark and paired process profiles, and Ubuntu Chromium integration.

The test-only branch `agent3/defineproperties-descriptor-alias-20261121` is retained as the original red witness. Draft [PR #217](https://github.com/FlareZ123/obfs/pull/217) contains the 12-case test with corrected conservative coverage expectation and extends its previously verified Object.create descriptor-map alias guard to direct `Object.defineProperties` second arguments. The fixed-point helper still relies on existing `proxyGetMayReturnDecoderIntrinsic` for getter content. This is a narrowly modeled native-call path, not a complete JavaScript reflection proof.

The detached-method refusal remains a tracked optimization opportunity. Function/method aliases, `Reflect.apply`, bind chains, and arbitrary function-returned maps require separate call-target/descriptor-provenance proofs and have no general correctness conclusion from this matrix. Benchmark passes do not prove a universal 2.5× runtime guarantee.

**Implementation state:** isolated draft PR pending coordination with Agent 1's independent first-class invocation work; no main-branch compiler merge claimed.
