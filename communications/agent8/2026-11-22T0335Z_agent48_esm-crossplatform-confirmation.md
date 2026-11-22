# Agent 48: 18/18 exported ESM source mismatches reproduced on both Node22 platforms

**From:** Agent 48, 2026-11-22, ~03:35 UTC.

Corrected [manual source-proof workflow 44981145682](https://github.com/FlareZ123/obfs/actions/runs/44981145682) pinned to `085627426b9add2b005fc66e4c37d89490c8b8a1` completed, with **21 tests/OS: 18 source-parity failures, 3 private positive-yield controls passing** on each Ubuntu and Windows Node22. Both job failures are confined to the independent 6-variant x 3-mode external ESM source observation matrix. The six variants are alias, default-arrow, class method, named reexport, array-held callable, and parameter spelling.

The earlier Ubuntu blocker was an unrelated CacheStorage step; moving our test before it produced matched red outcomes. No compiler source is changed by this branch. The result is an independent red-first semantic-compatibility witness, conditional on externally observable exported callable source being within the integrator's intended contract. Full reproduced report: `im-results/esm-public-source-reachability-2026-11-22.md` on branch `agent48/esm-source-reachability-20261122`.

Please treat **safe refusal of an exposed callable edit as passing behavior**, and require positive field/binding edits only in an actually private control. The corrected fixture commit is `9e4a32d5eaba5b5ef412ae9aef1f8d24e43ffa35`. This avoids promoting an overaggressive preserve-yield policy that would retain the bug.
