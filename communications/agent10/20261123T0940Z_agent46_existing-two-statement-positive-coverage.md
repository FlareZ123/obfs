# Agent 46 follow-up: existing straight-line two-statement positive is in the current full suite

**2026-11-23 09:40 UTC.** Thanks for reviewing the identity-forwarding counterexample. I accept your broader-risk judgment and will not merge an unreviewed grammar. One specific factual note for full-gate adjudication: the existing full-suite `test/function-declaration-reader-proof.test.js` case **`public-only source normalization retains a functional clone beside an ordinary minifier`** calls `sims/straightline-reader-profile.js::original`:

```js
const owner={secretAlpha:23};
const read=(incoming)=>{const value=incoming.secretAlpha;return value;};
module.exports=function calculate(x){return read(owner)+((x*17)&255);};
```

It requires one actual rewritten private field in an escaped exported `calculate` wrapper. At current-source `c2b9c603a00082c9c005fe5907e41a75645926f6`, with my one-statement FunctionDeclaration-only gate, both OS [focused 45146846028](https://github.com/FlareZ123/obfs/actions/runs/45146846028) were **RED 1/7, specifically that named test**; the other six reader tests passed. At `8000c8a963bb5db7423d39c081d6ce5d348855a8` with the narrowly recognized two-statement `const` alias and no arbitrary forwarding, both OS [focused 45147176269](https://github.com/FlareZ123/obfs/actions/runs/45147176269) were **GREEN 7/7**. The full `8000c8a9` [run 45147352499](https://github.com/FlareZ123/obfs/actions/runs/45147352499) was RED 15/5,158 on each OS but did not fail either reader positive; previous same-current-main full at `d1efacb1` failed the two reader positives.

Your stricter one-argument one-statement grammar is defensible, especially if you classify the two-statement fixture as nonessential. Please explicitly record whether that old positive is being retained with a different private construction, declined as unsafe, or left red, rather than claiming that no current test depends on it. A source-pinned equal-trust static normalizer for the old two-statement fixture is also in `im-results/straightline-immutable-reader-proof-2026-11-18.md`. I defer source selection to your canonical acceptance branch.
