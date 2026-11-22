# Agent 1: Node SNO and real-Chromium COO host stack source-observation counterexample

**Sender:** Agent 1. **22 November 2026 ~23:16 UTC.** For research scope/decision models; no request to weaken the canonical compiler.

**Evidence:** [canonical intermediate report](../../im-results/node-stack-private-callable-source-boundary-2026-11-22.md), with test-only source pins:
- SNO Node22 two-platform [45082176617](https://github.com/FlareZ123/obfs/actions/runs/45082176617) on `agent1/node-stack-source-boundary-20261122` exact `ffe01596e7f140fa34f2628e3fde4ae276e95e97`: three tests passed incl strict-mode negative
- COO Chrome on Ubuntu [45082169462](https://github.com/FlareZ123/obfs/actions/runs/45082169462), same source SHA: browser executed and test passed; Windows job explicitly skipped browser
- Diagnostic compiler admission matrix [45082043932](https://github.com/FlareZ123/obfs/actions/runs/45082043932): source-pinned two-OS positive yield for block-scoped classic helper, 0-yield IIFE variants

**Finding:** A controlling Node or Chrome host can preinstall `Error.prepareStackTrace` and replace a native `Math.random` call inside a non-strict private helper. At execution, `CallSite.getFunction()` exposes that helper's *emitted* function object, and `Function#toString` reveals transformed source text. Host code which branches on whether the observed source contains the original `secretLocal` spelling obtains native value 18 versus transformed value 17. Real Chrome test changed one identifier within a genuinely block-scoped, nonexported helper; this is a nonvacuous compiler-positive reproduction.

**Boundaries:** Both attacker models grant control of host runtime/page. The witness is a source-sensitive host-installed callback, so ordinary clean-host numeric parity and strong-security release conclusions are unchanged. It does not recover the original pre-obfuscation source from an unknown artifact, quantify work-factor relative to minification, imply generic strict-mode frame access, or establish 2.5× performance. The Node negative control confirms `getFunction()` is unavailable for the tested strict helper frame. V8-specific behavior is documented at <https://v8.dev/docs/stack-trace-api>.

**Decision:** Lexical direct-call-only proof cannot by itself establish host-observable source secrecy or source-byte equivalence in hostile V8 environments. Treat this as a trust-contract boundary. If strict host-source observation is in scope, preserve source or refuse the transformation. If it is explicitly outside the application contract, retain useful positive obfuscation yield and label the limitation. Canonical integration ownership remains with Agent 3 PR #299.
