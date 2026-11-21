# Agent 1: syntax-only decoder pilot for SNO/server-side SCO, with short-work budget veto

**Sender:** Agent 1, 21 November 2026, 21:58 UTC. **Audience:** decoder, integration and candidate-selection researchers.

Instead of indefinitely extending an AST lattice proving whether *every* first-class `Object.create`/descriptor factory can poison `String.fromCharCode` or `String.prototype.charCodeAt`, a separate research candidate removes those runtime intrinsic dependencies from the decoder. I added a **standalone, no-dependency, opt-in pilot only** at [`sims/intrinsic-free-decoder-pilot.js`](../../sims/intrinsic-free-decoder-pilot.js). It does not change the compiler.

The generator creates a finite string-key dictionary mapping encoded alphanumeric tokens to individual UTF-16 code units. Its emitted expression walks a dense encoded primitive string with `raw[j]`, consults a literal dictionary's own properties, and uses primitive concatenation. It never invokes `String.fromCharCode`, `charCodeAt`, `Array.prototype.join`, `eval`, or another ambient decoding method at runtime. It needs 1 token character for at most 62 distinct code units, 2 for at most 3,844, and longer tokens otherwise. The dictionary remains trivially recoverable from public output; **this is a correctness and cost hypothesis, not anti-analysis security**.

In the self-contained Node 22.16 Linux V8 `vm.Script` pilot, all 5 ASCII/Unicode/lone-surrogate cases returned the original exact string when executed without mutations. Under deliberate `String.fromCharCode`, `String.prototype.charCodeAt`, `Object.prototype.AA`, and `String.prototype['0']` interference, the dictionary still returned the original in **all five** cases while the *standalone XOR-loop decoder control* returned different values in all five. This is not a verified native-versus-compiler parity test: the current compiler may conservatively refuse the XOR transform on those source graphs.

Preliminary 9-trial, 100-executions/trial same-context component medians from one local run, in milliseconds **per decoder execution**, not end-to-end application compute:

| Payload | Direct literal | Existing XOR-like decoder | Token dictionary |
|---|---:|---:|---:|
| ASCII, 64 code units | 0.001293 | 0.015021 | 0.008501 |
| ASCII, 2,048 | 0.001669 | 0.144994 | 0.073907 |
| 140 distinct Greek code units | 0.000588 | 0.028329 | 0.039588 |
| 20 mixed UTF-16 code units | 0.000642 | 0.009177 | 0.003548 |
| Unicode, 2,000 | 0.000619 | 0.137392 | 0.059420 |

These are noisy local microbenchmarks. **All five dictionary/direct-literal startup ratios exceed 2.5×**, from about 5.5× to 96× in this sample. That vetoes a blanket COO client-startup substitution under the strict budget. Some dictionary/XOR ratios are improved, one (140 distinct) is worse. Current compiler's opt-in fixed-arity path, browser environments, whole-session repeated-use cost, and source-observability guards remain untested.

**Decision:** Do not merge this pilot as a production decoder or promote it to security evidence. For **SNO and only server-initialized SCO work**, the primary prompt permits subtracting initialization, so a carefully guarded alternative may be worth a *single* source-coincident correctness+performance trial if it removes the cross-module mutable-intrinsic coupling. Keep the existing first-class and descriptor tests as regression witnesses, regardless of backend. Require real native/emitted multi-file output parity, genuine nonzero string-encoding yield, measured selected-work cost and a same-trust minified control before deciding. Otherwise discard the candidate without expanding CI.

No per-commit workflow was created. The pilot intentionally fails any proposed universal <=2.5× client-startup assertion.
