# Source-pinned combined compiler compatibility result

**Agent 2, 21 November 2026. Intermediate integration result.** This is a disposable test combination, not a production release or security certification.

## Inputs

Exact integration commit: **d22e6860193a3afff3498f3ec212ba0d0be92006**. It was constructed as a single Git tree over source main 1ab610c31e2b34c09dfc2cf20391a88b3575b4d3, using content-addressed blobs from:

- Agent 39 [PR #207](https://github.com/FlareZ123/obfs/pull/207) head c118939aad17ee5a47c62a20075f45602ab7f702: eight pure test/benchmark files, including the updated real-browser reflection positive fixture and formerly stale source-observer tests.
- Agent 2 [PR #208](https://github.com/FlareZ123/obfs/pull/208) head b38626986d716da0b0eed82414614ba9777181db, itself stacked on Agent 1 [PR #204](https://github.com/FlareZ123/obfs/pull/204): conservative direct and immutable-const-alias Object.create accessor admission, 24 real-Node behavioral regressions and corresponding report.
- No competing Agent 2 draft PR #210 browser fixture was overlaid. Its alternate patch was closed as superseded, preserving independent evidence.

The main branch was not mutated by this integration.

## Full Linux and Windows result

[Manual obfuscator validation 44933203455](https://github.com/FlareZ123/obfs/actions/runs/44933203455) completed **success** on both Node 22 operating systems, with JSDoc validation and Chromium integration steps passing.

| Platform | Node tests | Passed | Failed | Skipped | Workflow |
|---|---:|---:|---:|---:|---|
| Ubuntu | 4,095 | 4,094 | 0 | 1 | success |
| Windows | 4,095 | 4,091 | 0 | 4 | success |

All **24/24** Object.create cross-mode native-versus-emitted cases passed on each OS, including the previous two const-alias corruption cases and the Number.prototype positive-yield controls. The former seven stale suite assertion failures were eliminated by the independently source-pinned PR #207. This is evidence of coexistence and observable compatibility in the tested matrix, without a universal JavaScript equivalence claim.

Agent 39's standalone updated PR #207 also achieved successful full Ubuntu and Windows workflow jobs in [44932740561](https://github.com/FlareZ123/obfs/actions/runs/44932740561). Agent 2's initial PR #208 alone passed 24/24 selected tests in [44931776258](https://github.com/FlareZ123/obfs/actions/runs/44931776258) on both OS, but its branch's older baseline had seven full-suite failures. The matched comparison isolates these effects.

## Separate comprehensive browser workflow

[Manual real-browser validation 44933207667](https://github.com/FlareZ123/obfs/actions/runs/44933207667), on the **same** integration commit, passed real Chromium module and host-lock integration, function-source clone tests, XML URL tests, XOR decoder tests, imported-key graph tests, external JSDoc checks, and real SCO browser example. It failed at the distinct source-only SCO spelling-mask expectation in test/sco-spelling-mask-browser.js:113: report.matched was false, while the subprocess returned normally.

Separate targeted diagnostics at source 4e7581128e98e45ea4f883bc0d7e5d6222c8b9be, [run 44933493379](https://github.com/FlareZ123/obfs/actions/runs/44933493379), located the first public source discrepancy at byte offset 206, the beginning of the second eligible literal. A mask-phase offset of **minus two** matched the next 12 observed selector bits exactly. SCO spells literals using their AST start offsets before the core optimizer renames bindings; the second original source identifier has length 12 (secondMarker), while its emitted name has length 14 (_v56e3df910f7c). Consequently, the source-only attacker cannot presume that the later emitted canonical literal offsets equal the original pre-renaming offsets. The 32-bit literal mask bound remains unaffected by this failure of the byte-exact reconstruction harness. A separate source-only canonicalizer still needs to be verified on its own behavioral oracle.

A revised browser evidence harness on agent2/sco-spelling-mask-diagnostic-20261121 preserves exact canonicalized-source equivalence and execution parity while explicitly **reporting** per-response mask recovery, rather than claiming unsupported byte-exact mask reproduction in the renamed graph. Its independent CI is tracked separately. This integration report does not call the comprehensive browser gate green.

## Release boundary

The full Node/Linux/Windows test pass is a meaningful compiler-compatibility milestone. It does not settle static reconstruction, dynamic extraction, integrity-bypass resistance, domain locking against a hostile runtime, or the 2.5x runtime ceiling. Existing release evidence remains **RELEASE-BLOCKED**.
