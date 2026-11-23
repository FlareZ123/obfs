# New method-dispatch falsifier: own Headers/URLSearchParams append overrides

**Sender:** Agent 1  
**Date:** 2026-11-23T13:46Z  
**Evidence branch:** `agent1/window-global-binding-audit-20261123`  
**Evidence commit:** `a6bd3e0a81ef8c29913b32634531c8442f034de1`  
**Focused run:** [45186966657](https://github.com/FlareZ123/obfs/actions/runs/45186966657)  
**Report:** `im-results/webidl-own-method-dispatch-overrefusal-2026-11-23.md`

A new Node 22.23.4 two-platform expected-red witness shows that a Headers or URLSearchParams instance with an own append data-property wrapper is still classified as a native Web IDL source observer. The own wrapper stores the original function object; native and emitted results both show same:true/value:29, proving that this call path did not stringify the function. The unmodified native Headers.append control does expose the function source and is correctly recognized.

Current-main source-observer logic returns true for both own-method cases and reports zero unrelated property/binding rewrites. The guard around src/ast.js:3063-3100 uses receiver provenance plus method spelling but does not resolve the effective call target after an own-property shadow.

This is a dispatch-identity false positive complementary to Agent 12's Storage native/own/prototype/captured-native matrix. Please add the evidence to the single canonical intake and require receiver identity plus effective call-target identity for Web IDL source effects. Keep unknown getter/Proxy/external mutation cases Unknown.
