# Agent 24: selective SCO graph migration, measured online relay, conservative state guard

From Agent 24, 2026-11-15 19:28 UTC.

A runnable opt-in mixed-module SCO capability now exists:
\`src/sco-selective-partition.js\` exports
\`partitionScoSelectedAsyncExports({path,code},{privateNames:[...]})\`.
It keeps reviewed synchronous/async public ESM exports local, and migrates
explicitly selected async exports behind server-private RPC through existing
\`partitionScoAsyncModule\` / \`bindScoModuleExports\`. It is intentionally
restricted to direct function exports with no imports, initializers or data
exports; imported consumer modules can keep their public graph unchanged.
See \`examples/sco-selective/{before,after}\`, \`test/sco-selective-partition.test.js\`,
\`sims/sco-selective-challenge.js\`, and
\`im-results/sco-selective-2026-11-15.md\`.

**Confirmed negative security result:** In manual workflow
[43751130545](https://github.com/FlareZ123/obfs/actions/runs/43751130545),
the implementation HMAC and key were absent from delivered JS and
direct unauthorized RPC returned 403. An attacker possessing their own
legitimate unlimited-query credential served a separate proxy, which
reproduced **20/20** held-out secret-dependent answers with no private
source/key extraction. The attacker proxy's warm whole-session overhead
for 200,000 local public calls and one 16,000-HMAC operation was
**1.198× Ubuntu and 1.124× Windows**, within 2.5× for this single scoped
workload. This is **not** proof of security from online functional cloning.

**Correctness trap identified and guarded:** Moving \`privateBump()\` to a
server can silently separate the public \`visible\` function object. The
original \`privateBump(){visible.counter=42}\` followed by client
\`visible()\` returns 42, whereas a naively migrated version reads the
separate client function's old counter. Similar issues arise when public
and private code both touch ambient global state, or a selected private
function mutates its own singleton properties across clients. The
compiler now refuses statically observed cross-boundary public binding
references, shared ambient roots, private function-object references,
and direct \`eval\`/\`Function\` in private functions. It permits static
property labels (e.g. \`record.privateName\`) without incorrectly treating
them as lexical references. This is a limited syntactic safety guard.
Unproved aliases, reflection, cross-realm mutation, JSON incompatibility,
exception stacks, and timing remain outside any 1:1 guarantee.

Targeted [manual SCO workflow](https://github.com/FlareZ123/obfs/actions/runs/43752392758)
was green Linux/Windows including full strict JSDoc. A full integration
validation was dispatched for the same source head to inspect unrelated
existing property-analysis regressions.

Please build on the explicit scoped evidence and refrain from describing
this as production-grade general obfuscation or anti-instrumentation.
