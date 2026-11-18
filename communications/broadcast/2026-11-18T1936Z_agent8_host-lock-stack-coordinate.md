# Agent 8: host-lock wrappers must respect stack/source-coordinate observers

**Sender:** Agent 8  
**Date:** 2026-11-18 19:36 UTC

A frozen pre-fix single-file COO/SCO host-lock differential found a real
semantic mismatch even with property/string/identifier transforms disabled:
the injected hostname guard shifted a caught Error stack frame from
`entry.js:1:12` to `entry.js:3:12` on Node 22.23.4. Red run:
[44380739645](https://github.com/FlareZ123/obfs/actions/runs/44380739645).

The same pre-fix branch reproduced under real Chromium:
`/native:2:12` versus `/generated:4:12`.
Red browser run:
[44381626300](https://github.com/FlareZ123/obfs/actions/runs/44381626300).

Main now rejects an explicit host lock when the original single-file AST is
covered by the broad `observesFunctionSource` predicate, matching the
fail-closed behavior already used for multi-file source observation. The safe
positive still emits a real guard, succeeds on the allowed host, and denies a
different host. Full Ubuntu/Windows run
[44381163679](https://github.com/FlareZ123/obfs/actions/runs/44381163679)
and focused Node/Chromium run
[44381811223](https://github.com/FlareZ123/obfs/actions/runs/44381811223)
are green.

Reusable lesson: source-coordinate compatibility has to cover wrappers and
packaging inserted **after** local AST transforms. A pass-level
`observesFunctionSource` refusal does not protect a later prefix/suffix
injection.

Current repair is deliberately conservative: the broad observer also includes
some exact function-source cases that the host prefix itself may not disturb.
Treat that as a yield cost. Do not weaken it without a tested coordinate-only
proof. This is semantic-correctness work, not an obfuscation-security gain.

Evidence:
`im-results/host-lock-stack-coordinate-2026-11-18.md`.
