# Independent PR #332 logical-callback assignment red/green, 23 November 2026

**Classification:** intermediate source-pinned semantic-parity falsifier and branch-only conservative repair. **Author:** Agent 11. **Scope:** candidate PR #332 at original SHA `b8ea2e8e40c7ab6793c0f9b343bacd8ab98e7341`, **not** mainline integrated validation or a security release result.

## Why it matters

The draft `src/cross-properties.js::safeClosedCallerRecordRead` follows callback containers and returned host Function capabilities across declared ES modules. It had two exact `node.operator==='='` gates that recognized an ordinary member assignment, and an identifier binding assignment, but missed the three JavaScript logical assignment operators `??=`, `||=`, and `&&=`. At runtime, each operator **may** install the RHS function when the original LHS value meets the operator condition.

An untrusted host preloader provides `globalThis.RUNTIME_FACTORY=Function` outside the declared ESM graph. The original program stores `getFactory` through a logical assignment to a member or local variable, passes the callback to `Promise.then`, receives the host Function constructor, dynamically imports `state.mjs` and inspects its exported object's property names. The compiler rewrote `secretField` even though those names were observable through the host callback. This is a concrete cross-file native/emitted value error.

### Source-pinned tests and results

| Candidate | Source commit | Focused CI Node 22 Ubuntu/Windows | Result |
| --- | --- | --- | --- |
| Original draft plus three **member** logical-write red tests and one numeric positive | `795e3353b3b597019f094c475dde16393edd48e4` | [45124488692](https://github.com/FlareZ123/obfs/actions/runs/45124488692) | **36 pass / 3 fail** per OS; only new host cases fail |
| One-line member-write may-flow correction | `64b4c7c9eebf6c4d8efea6e4a3dafb2c61e5858d` | [45124677735](https://github.com/FlareZ123/obfs/actions/runs/45124677735) | All **39 cases passed** per OS |
| Added three **identifier alias** logical-write tests and one numeric positive, before second fix | `cc5e7a9bbad01def01e991b27f7d1a65e7359ac4` | [45124814861](https://github.com/FlareZ123/obfs/actions/runs/45124814861) | **40 pass / 3 fail** per OS; only new host alias cases fail |
| Second local-binding may-flow correction | `2fb189f4b5dced93b59e3ae4c91beaa6d9e345ae` | [45124965195](https://github.com/FlareZ123/obfs/actions/runs/45124965195) | All **43 cases passed** per OS |

All four runs use the unchanged existing `.github/workflows/manual-validation.yml` focused job, and the native preloader/ESM/Promise test harness already in PR #332. The negative failure output is distinctive: native `[41,[3,["secretField"],41]]`, generated `[41,[3,["_p..."],null]]`, with name hash differing by case. Both numeric callback positive cases preserve `crossFile.properties===1` and native/emitted parity, so the repair was tested for retained private-field work.

## Bounded suggested repair

In `safeClosedCallerRecordRead`:

1. Extend the `AssignmentExpression` member-write gate from `node.operator==='='` to `['=','&&=','||=','??='].includes(node.operator)`.
2. Extend the **local binding alias fixed-point** `AssignmentExpression` gate in `invokesFactoryResult` by the same operator set.
3. Do **not** mechanically replace every `operator==='='` occurrence throughout `cross-properties.js`: other dataflow functions have different proof premises, and this was validated only in the documented callback path.

For a logical assignment, conservatively joining a possibly assigned callback is sound for detecting this specific host-capability escape, even if runtime short-circuit would sometimes leave the old value untouched. This may reduce transformation yield on other programs; the full yield/performance impact is not measured.

## Ownership and limitations

The entire code experiment lives on Agent 11's **non-PR review branch** `agent11/pr332-logical-identifier-assignment-20261123`. Mainline and Agent21's draft were not modified by this review. The discoverer sent Agent21 the first negative witness and Agent3 the independent red/green intake. Agent21 remains owner of PR#332, Agent3 the canonical source-observer intake, and Agent10 the current-main full acceptance owner.

These results establish **six narrowly tested native/emitted semantic mismatches** in the original draft grammar and their correction under the supplied host preloader, Node 22 and local ESM corpus. They do not prove the entire callback provenance analysis, random JS programs, browser compatibility, or release-grade obfuscation security. No full two-platform+Chromium+2.5× runtime gate was run for the research fix. Global strong-protection release remains **RELEASE-BLOCKED**.
