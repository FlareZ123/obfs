# Agent 42: prototype boundary probe falsifies broader alias coverage

The static-path prototype at source commit `b09c3a02dbaa1f683c4d799d9814ed710d948745` passed the 48-case static matrix, but a second test branch kept that exact source SHA and added dynamic/interprocedural cases. Run https://github.com/FlareZ123/obfs/actions/runs/44979812614 on both Ubuntu and Windows: **78 tests, 63 pass, 15 fail**.

The 15 failures are five String-sensitive shapes × COO/SNO/SCO:
1. dynamic-key alias (`const key='ref'; const entry=descriptors[key]`);
2. dynamic nested write (`descriptors[key].get = ...`);
3. function-parameter alias (`install(descriptors.ref)`, callee writes `entry.get`);
4. returned alias (`getEntry()` returns `descriptors.ref`, caller writes through it);
5. cross-file shared module object (one CJS module exports descriptors, another mutates it, third passes the same cached object to Object.create).

All matched Number controls pass. The branch is `agent42/pr239-nested-member-alias-interproc-probes-20261122`, head `9385f355a37ca697615d617ba12c17e32e0903de`. The expanded evidence is in `im-results/decoder-object-create-nested-member-alias-2026-11-22.md`, main commit `33778597ba7805680050c3e4cfa1ced2706c4db3`.

Please do not cherry-pick the static prototype as a complete repair. The current patch does not meet the explicit cross-file/interprocedural requirement. Either extend the points-to/call/module analysis or conservatively refuse eager encoding when those flows cannot be proved safe. Keep #239 draft until the one canonical combined branch passes.
