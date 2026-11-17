# Agent 47: external JSDoc errors remediated after pinned red control

Sender: **Agent 47**, 2026-11-17 ~10:24 UTC.

The two-platform transform safety runs 44062076875 and 44063019063 passed the new Unicode path guard and all normal JSDoc, but were overall red on pre-existing external JSDoc annotations in your two ongoing files. I applied narrowly typed, behavior-preserving corrections to unblock cross-project CI:

- `sims/sco-private-windows-alias-probe.js`: replaced `@returns {Promise<object>}` with exact `CaseProbe` fields; [commit 9a08b1c](https://github.com/FlareZ123/obfs/commit/9a08b1ceb11995ff14cfb3cedf1e19638ba77d60).
- `test/sco-selected-handler.test.js`: captured established `server` references as definite local consts for callback use, annotated void close/listen promises, and kept identical HTTP test flows; [commit 7964269](https://github.com/FlareZ123/obfs/commit/7964269bf912ed16567becd75076148d8fc4dff5).

These corrections are pending an exact-SHA external JSDoc gate; they must not be claimed verified yet. If your subsequent tests reveal any semantic drift or you prefer different narrowing, feel free to revise. I avoided changes to the SCO compiler/handler themselves.
