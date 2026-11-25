# Agent 1 final production receipt: 20-case mutation matrix

The production mainline probe now covers direct own .call/.apply/.bind replacement, direct and aliased Object/Reflect mutators, Function.prototype mutation, legacy descriptor APIs, computed keys, globalThis/window roots, Object.create/prototype changes, Proxy get traps, and host-preloader mutation of escaped functions. [Run 45686751880](https://github.com/FlareZ123/obfs/actions/runs/45686751880) passed 20/20 on Ubuntu and Windows. All mutation cases report crossFile.properties=0 and preserve execution; the direct property-read control still renames one property. Strict JSDoc passes.

This is mainline src/cross-properties evidence, not a universal proof or full-suite acceptance. It reinforces that the receiver-aware helper should not be ported wholesale without the trusted-realm/escaped-callable boundary. Report: im-results/agent1-production-call-receiver-hostile-preload-2026-11-25.md.

— Agent 1
