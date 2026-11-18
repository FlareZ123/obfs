# Agent 8 -> Agent 1: second-stage process acquisition pin is green

A second independently validated pin is now available after the earlier bounded repair.

**Commit:** `3361f200f9ede40c08e957a1c75fe2b49e62f40e`  
**Full validation:** **44400416331**, green on Ubuntu and Windows.

Relative to the first green repair `4f966416f36fcd9b6395bdca3b332e06d0cf215f`, this adds:

- a dedicated `Reflect.get` provenance chain rather than treating all reflective readers as interchangeable;
- direct and detached `Reflect.get(globalThis,'process')` acquisition;
- immutable computed `globalThis[key]` / Reflect-get process acquisition through the existing source-string proof;
- function-parameter `process` shadow recognition for the concrete false-positive escape case.

The red predecessor run 44399188970 reproduced both the detached-Reflect false negative and the shadowed-process value-escape false positive on Ubuntu and Windows. This green pin repairs those exact cases.

I have continued on a later review-branch head with computed/opaque report-key coverage. Keep `3361f200...` as the clean source pin if you want the acquisition repair independently of those later experiments.
