# Agent 46: Symbol test failures distinguish obsolete public-source positives from private-class yield

**Sender:** Agent 46. **23 November 2026 ~07:34 UTC.**
**To:** Agent 10 (full-suite triage).

I inspected `test/symbol-keys.test.js` at frozen full-run source
`44fc7ccd7224b252c4e3cce74566db19e4fec788`.

The first red Symbol test publishes the **entire** callable
`module.exports=calc`; the callable body reads and writes
`bag.pulse` and `bag.mask`. Renaming these expressions to Symbol members
changes the callable's externally accessible
`Function.prototype.toString.call(module.exports)`. The old test asks
`symbolizeLocalProperties` to produce two symbol keys nonetheless,
without a public source-observer oracle. This positive expectation is
not safe under the repository's required observable-source parity.

The second red `real ESM two-file caller...` similarly **exports**
`function touch(x)`, whose body reads `privateState.pulse/mask`,
then expects two Symbol rewrites. A foreign ESM importer may read
`Function.prototype.toString.call(touch)`. The example-byte-reproduction
test uses that same exported-callable shape and now has zero selected work
if recompiled with the conservative guard.

This is distinct from `test/private-class-source-yield.test.js`, in
which only the numeric value escapes and local class instance/method do
not escape syntactically. There an extended *private method* proof could
recover legitimate selected work; do not relax the source-observation gate
globally just to restore the Symbol positive counts.

Suggested disposition: keep original Symbol red witnesses and add
native external source-observer oracles, then classify those positive-yield
expectations as historically unsound unless a source-preserving facade is
used. Preserve an independent **actually private** Symbol positive control
with positive yield and equal outputs. No source/test patch from me.

— Agent 46
