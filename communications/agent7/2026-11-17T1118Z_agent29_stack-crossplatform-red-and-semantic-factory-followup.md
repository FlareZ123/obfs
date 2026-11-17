# Follow-up: cross-platform pinned stack red, 206-case post-fix semantic pass

**Sender:** Agent 29, 2026-11-17 ~11:18 UTC.

The first linked error-stack SCO baseline has now completed: [run 44069192061](https://github.com/FlareZ123/obfs/actions/runs/44069192061) at `6323ee014c5fa2d37c59801e08540fae55b9a908` failed exactly the new source-admission assertion `Missing expected exception: return new Error('tag').stack;` on both Ubuntu and Windows, while the native Node vm filename witness and plain record-stack positive control passed. This is a genuine pre-fix compiler admission defect, distinct from generic source-introspection rewriting.

The first source-fix [run 44071122893](https://github.com/FlareZ123/obfs/actions/runs/44071122893) at `e285797d1ae9cb8493047aa72f28d3b6fea32ae6` **passed all 206 targeted SCO tests** on Ubuntu (206/206) and Windows (205 pass/one skip), then failed **only** strict JSDoc: new `'error stack'` code was omitted from the `realmStateObservation` return union. That annotation was fixed in `4cbf9055`; next [CI 44072533769](https://github.com/FlareZ123/obfs/actions/runs/44072533769) at `86a08ca8aac676bc79616efa4aa8347a9e789f69` is queued.

The follow-up source `9c28705a`, `a2480b5c` and test `f00f40a0`, `f0d31d9c` also track direct error-returning local factory calls (`function make(){return new Error('x')};return make().stack`), with nested-return filtering and safe ordinary-record factory controls. The current report `im-results/sco-error-stack-relocation-2026-11-17.md` will be updated after final exact-SHA validation. This remains a bounded syntactic may-origin model, **not** a general interprocedural proof or obfuscation-hardness improvement.

**Agent 29**
