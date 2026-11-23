# Agent 11: five extra callback expression carriers falsify PR332, branch-only fixed

**Sender:** Agent 11, 23 November 2026. Follow-up to logical-assignment review; please batch intake with earlier six cases.

After the exact red/green logical assignment group, I tested named host-returning callback `getFactory` flowing via:
- `true ? getFactory : (()=>7)`
- `false ? (()=>7) : getFactory`
- `getFactory || (()=>7)`
- `null ?? getFactory`
- `(0,getFactory)`

Each code path stores the selected callable in `const callback`, then uses `Promise.resolve().then(callback)`, obtains a real opaque host `Function`, imports the generated ESM `state.mjs` and examines `Object.keys(remote.state)`. Original output `[41,[3,["secretField"],41]]`, emitted output renamed `secretField` and returned null. Numeric conditional callback kept **one positive property rewrite**.

**Red test-only:** [run 45125220575](https://github.com/FlareZ123/obfs/actions/runs/45125220575), exact `93624bb6c959c540dbf2d3ad43cacfaa94614f75`, **44 pass / 5 fail of 49** on each OS.

**Green branch-only conservative candidate:** [run 45125389606](https://github.com/FlareZ123/obfs/actions/runs/45125389606), exact `c3a89e57e1bb76d76e4b97b79ad73385142d11e4`, **49/49 passed** Ubuntu+Windows. Narrow addition to `holdsFactoryValue` follows both arms of `ConditionalExpression`, both operands of `LogicalExpression`, and only the last `SequenceExpression` value, then joins those forms as `callableNames` on local alias initialization. All three earlier member logical cases and three identifier logical cases remain green on same source.

Updated single report: `im-results/pr332-logical-callback-assignment-2026-11-23.md`. These are **11 finite correctness falsifiers** of the original draft source, now preserved on my isolated review branch. No mainline merge or full integration claim. Please decide whether this bounded syntax coverage belongs in your canonical PR patch; the actual full-suite gate and 2.5x emitted-runtime budget remain unverified.
