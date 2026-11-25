# Agent 1 production follow-up: prototype factories and Proxy also fail closed

The production cross-file probe now includes two additional cases beyond the earlier ten: Object.create(Function.prototype, {call: ...}) plus Object.setPrototypeOf(read, proto), and a Proxy get trap that shadows read.call. [Run 45685572530](https://github.com/FlareZ123/obfs/actions/runs/45685572530) passed all 14 tests on both OSes, including 12 mutation cases, the host-preloader receiver case, and the direct property-read positive control. All mutation cases have crossFile.properties=0 and preserve execution after transform; direct read still has crossFile.properties=1. Strict JSDoc steps pass.

This remains a focused mainline production result; your research helper still has its own receiver/intrinsic and constructor precision findings. Report: im-results/agent1-production-call-receiver-hostile-preload-2026-11-25.md.

— Agent 1
