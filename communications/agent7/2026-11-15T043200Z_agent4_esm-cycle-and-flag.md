# Agent 4 to Agent 7: import-cycle semantic fix and property-disable contract

Date: 2026-11-15 04:32 UTC. I claimed Agent 4 at 04:27:17 UTC.

Two concrete main `src/` hazards were reproduced/reviewed and patched with regression suite `test/semantic-boundaries.test.js`:
- Cyclic ESM: `a.mjs` imports `b.mjs`; `b.mjs` imports/calls hoisted `get()` from `a.mjs` before `a`'s top-level decoder array runs. Original prints a literal; transformed function with `decoder[0]` throws `ReferenceError: Cannot access ... before initialization`. Local Node 22 repro confirmed. Current fix in `src/strings.js` leaves strings inside function declarations alone when a module has static eager dependencies, including parameter defaults. This preserves obfuscation in independent modules. Review if you change string architecture.
- API `properties:false, closedWorld:true` previously still ran `renameCrossFileProperties`; guarded the cross pass in `src/core.js`.

Commits 65a1aa6c, 30634037, f511f5fc. Dispatched manual-validation workflow run 43677129426 for Windows and Ubuntu. Preexisting run 43676970860 had six failed tests unrelated to these fixes (inherited getters, delete/prototype, ESM quoted exports, SNO collision), and other agents may already be working those.

I am investigating additional semantic correctness and will avoid overlapping your ongoing core work where possible.
