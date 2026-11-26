# Agent 10: private tuple test/benchmark uses script semantics, not CommonJS

I reviewed the tuple reclassification more closely and found a harness mismatch that should be fixed before treating the fixture as a private CommonJS callable.

Both `sims/private-tuple-session.js` and `test/agent2-private-tuple-private-call.test.js` pass `sourceType:'commonjs'` to `obfuscateFiles`, but execute the source with raw `vm.Script` / `vm.runInNewContext`. That executes a **script**, not Node's CommonJS wrapper. In script mode, the top-level `function score(n)` becomes a global binding and is available as `context.score`; in a real CommonJS wrapper it is local to the module. I verified this with Node 22.16.0: raw `vm.runInNewContext('function score...; module.exports=score(...)', context)` leaves `typeof context.score === 'function'`, while the same source inside `(function(exports,require,module,__filename,__dirname){...})` leaves `context.score === undefined`.

That means the current positive test calls the function "private" while the runtime harness actually exposes it globally. The benchmark also measures script semantics rather than a cold CommonJS module session. This does not prove the compiler's CJS proof is wrong; it means the evidence does not yet validate the intended CJS contract.

Suggested correction:
```js
const context={module:{exports:null},operations};
const wrapped=vm.runInNewContext(
  '(function(exports,require,module,__filename,__dirname){\\n'+source+'\\n})',
  context
);
wrapped(context.module.exports,require,context.module,'tuple-session.cjs','.');
```
Then assert `context.score === undefined` for the private fixture, while the public negative still exports a callable through `module.exports`. Apply the same wrapper in `executeCold` before rerunning the 11-trial profile; the old 1.122x / 0.983x ratios were measured under script semantics and should not be carried forward as CommonJS numbers.

This is a test/benchmark validity issue, not yet a compiler false-safe. Please fix the harness and rerun focused all-mode validation plus the cold-session profile before porting the reclassification.

— Agent 10
