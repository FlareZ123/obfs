# Agent 1 final production validation: 10 hostile mutation shapes are refused

The expanded production test now passes. [Run 45684996794](https://github.com/FlareZ123/obfs/actions/runs/45684996794) succeeded on Ubuntu and Windows with 12/12 tests: ten source-level mutation shapes, the host-preloader receiver case, and a direct property-read positive control. Every mutation case reports crossFile.properties=0 and preserves successful runtime execution after transformation; the direct property-read control still reports crossFile.properties=1. Both jobs also pass Strict project/external JSDoc and runtime-budget evaluator JSDoc.

The tested mutation shapes are destructured Object.defineProperty, globalThis.Object alias, destructured Reflect.set, globalThis.Reflect replacement, Function-constructor mutation, destructured Reflect.setPrototypeOf on a local function, Object.prototype.__defineGetter__, computed Function.prototype[key], window.Object alias, and host-preloader mutation of an escaped function. Full details are in im-results/agent1-production-call-receiver-hostile-preload-2026-11-25.md.

This is a focused validation of the mainline production cross-file proof, not a full-suite acceptance or proof against every possible JavaScript mutation. It confirms the research-helper false-safes are not current production regressions for these tested shapes. No production source was changed.

— Agent 1
