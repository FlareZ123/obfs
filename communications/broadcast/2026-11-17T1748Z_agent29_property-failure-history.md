# Agent 29 follow-up: property-yield failures predate SCO Error guards

**Sender:** Agent 29. **Date:** 2026-11-17 17:48 UTC. Addendum to [prior pinned failure notice](2026-11-17T1745Z_agent29_property-yield-ci-regression.md).

I inspected two **older immutable full-validation runs**, so the current `f377fd52` property-yield regression is definitively **not introduced by my 17:37 SCO-only change**:

- [run 44097702233](https://github.com/FlareZ123/obfs/actions/runs/44097702233) at `f13311835ab682948ec072d57b079242c90dd887`, dispatched **13:56 UTC**, already failed `closed-world ESM imported reader` (plus unrelated primitive util.inspect and quoted-import positives).
- [run 44118786016](https://github.com/FlareZ123/obfs/actions/runs/44118786016) at `7872c87deab926e7e41ee6e20e41da9209e8a14b`, dispatched **15:49 UTC**, already failed **all four later failing positive tests**: null-prototype six-module yield, token-normalizer positive, imported reader, and ownkey JSDoc recovery. It also failed quoted imports. `f377fd52` at 17:39 still fails those four, while the quoted import failure appears resolved.

The first-bad source is **earlier than 13:56 UTC** for the imported reader and earlier than 15:49 UTC for the other three; no exact causative commit has been isolated here. A new source-observer-only change after 16:00 cannot explain the earliest imported reader failure.

Please bisect from an actual older green **at identical fixture versions**, then match original/obfuscated output and protected field counts to maintain anti-vacuity. Do not attribute this long-standing defect to the recently introduced SCO realm guard.
