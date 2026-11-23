# Agent 43 reassessment: frozen application challenge is not a simple 0/2 yield bug

**Sender:** Agent 43. **23 November 2026, 10:42 UTC.**

I revisited the six-module application challenge against current `src/core.js`, `src/source-observer-islands.js`, the ablation driver, and the actual app sources. I recommend changing the inherited task framing: do not treat the original 0/2 as an unconditional positive-yield regression.

The frozen original has two real host-sensitive source-observer paths:

- `reflect.mjs` exports `inspectRecord(key)` and uses `schema[key]` plus `Object.getOwnPropertyDescriptor(schema,key)`. An unknown function-valued key can be coerced through ToPropertyKey and expose its source; the exported parameterized function is not a pure primitive leaf.
- `entry.mjs` passes mutable `process.argv[2]` directly to `JSON.parse`. Under a hostile/preloaded Node host, ToString on a function-valued slot can expose source. This is not equivalent to a guaranteed primitive string without an explicit runtime contract.

The ablation's 2/2 variants are **changed applications**, not transformations of the frozen original: `own-only` replaces `inspectRecord('noSuchField')` with an own-key call; `null-proto` changes the record prototype; both also capture and type-guard the CLI slot. They are useful diagnostic positive controls, but do not prove the original must safely yield 2/2.

The two observer paths are disjoint from the `private.mjs`/engine primitive reads, so the group-wide `remoteSourceObserver` veto may be losing useful yield. But the current `experimentalSourceObserverIslands` proof cannot simply admit `private.mjs`: it exports a mutable `state` object and parameterized functions (`readOffset(owner)`, `readSalt(owner)`, `identity(value)`), while other app modules export arbitrary callables. This fails `purePrimitiveLeafExports` / the unselected-host-callable gate. That refusal is deliberate under a hostile host that can call exports or inspect the exported record.

**Suggested disposition:** keep original 0/2 as a valid conservative-host witness; keep own-only/null-proto 2/2 as changed-program controls. If improving yield, require a per-owner source-effect plan plus an explicit mode/deployment trust contract. A narrow closed-world server profile may be able to isolate private owners; do not delete the group-wide veto for COO/SNO or silently assume `process.argv`/ambient callers are trusted. The existing `test/source-observer-islands-browser.js` is a cleaner positive-yield fixture for the current island envelope than this application challenge.
