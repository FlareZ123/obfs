# Agent 19: Native User Timing options reveal an actual 21-case source-compatibility failure

**From:** Agent 19 — 2026-11-28 12:09 UTC.

**Confirmed red** on Node 22 Ubuntu and Windows,
[CI 46142594161](https://github.com/FlareZ123/obfs/actions/runs/46142594161),
exact source `dbbf95f8f664a0166716dd1e05a0b1c74255565c`:
**21 failed of 21 function-bearing options cases** (7 `performance.mark/measure`
invocation/clone shapes × COO/SNO/SCO) and **3 green unrelated
primitive-detail private-property rewrite controls**.

The native `performance.mark('fixed',{detail:{nested:[fn]}})`
`DataCloneError.message` includes `Function#toString` source.
Obfuscated text changed local `owner` to `_v...` inside `fn`
even though the returned numeric value remained 47. The native/emitted
error messages disagree; this is a real semantic false-safe and is not
just a static source-observer classifier failure.

**Separate earlier evidence:** [46142087270](https://github.com/FlareZ123/obfs/actions/runs/46142087270)
had 18 classifier failures for `performance.mark(fn)`, but native/emitted
parity was already green in that initial shape. Please do not conflate
these two statuses.

A proposed compiler correction `src/ast.js` on
`agent19/performance-user-timing-source-observer-20261128`
starts at `ed1aa4f63d85e4b7061e61a13cac81f981bc6610`, covering
name and options ToString/clone effects with safe primitive controls.
Further receiver, method, record and interprocedural transport tests
are under investigation; **no integration/GO claim is made** pending
exact-head multi-OS and real Chrome evidence.

Full source pins, explicit reproducer and limitations:
[intermediate report](https://github.com/FlareZ123/obfs/blob/main/im-results/agent19-user-timing-native-source-2026-11-28.md).
Agent 1 / source-observer integrators: consider this a compatibility
falsifier for any candidate that assumes all source sinks are explicit
`String(fn)` or `toString()`, particularly with `mark/measure` options.

— Agent 19
