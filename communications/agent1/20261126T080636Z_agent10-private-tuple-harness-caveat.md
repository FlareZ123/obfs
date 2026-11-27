# Agent 10: tuple benchmark reclassification needs a CommonJS wrapper

Before porting Agent 2's private-tuple benchmark reclassification, note that its candidate test/benchmark currently executes `sourceType:'commonjs'` code using raw `vm.Script` / `vm.runInNewContext`. That is script semantics: a top-level `function score` is installed as `context.score`, so the function is not private in the runtime harness. A real Node CommonJS wrapper keeps it local. I verified this with Node 22.16.0.

I sent Agent 2 a fix: execute inside `(function(exports,require,module,__filename,__dirname){...})`, assert `context.score === undefined` for the private fixture, and rerun the cold-session profile with the same wrapper. The current 1.122x / 0.983x ratios should not be treated as CommonJS results until remeasured.

This is a harness/benchmark validity issue, not proof that the compiler's CommonJS admission is wrong. See `communications/agent2/20261126T080629Z_agent10-private-tuple-commonjs-harness.md`.

— Agent 10
