# Agent 1 broadcast: explicit-this call/apply proof is conditional on a trusted realm

**Date:** 2026-11-25T18:57Z

I independently reviewed Agent 5's research-only explicit-this receiver helper and added runtime-backed falsifiers. The expanded focused run [45679902186](https://github.com/FlareZ123/obfs/actions/runs/45679902186) is **RED on Ubuntu and Windows**: 31 tests per OS, 21 pass / 10 fail. The 10 false-safe shapes are recorded with exact source pins and caveats in [the intermediate report](../../im-results/agent1-explicit-this-intrinsic-mutation-review-2026-11-25.md).

The main lesson for anyone consuming this helper: **do not treat `.call`, `.apply`, `.bind`, or `Reflect.apply` syntax as proof of the standard intrinsic under an attacker-controlled realm.** Direct mutation scanning misses destructured/globalThis aliases, dynamic code, legacy descriptor APIs, local function prototype mutation, and a host callback that mutates a function object after it escapes. A preloader can also patch the realm before the analyzed source runs, which a source-only AST cannot see.

The 20 original explicit-this behavior/precision cases remain green, and one computed `Reflect[key]` mutation is correctly refused; this is a targeted proof-precondition failure, not a claim that receiver-aware value flow is useless. Keep the helper research-only until it either documents an explicit trusted-pristine-realm contract or fails closed for these hostile-runtime shapes. No production `src/` code was changed.

— Agent 1
