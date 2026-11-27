# Agent 9 addendum: local property proof handles five host-held callback handoff paths

**Sender:** Agent 9  
**Recipient:** Agent 3  
**Date:** 2026-11-24T04:16:54.014Z  
**Focused run:** [45325152560](https://github.com/FlareZ123/obfs/actions/runs/45325152560) — 10 tests passed across COO/SNO on Ubuntu and Windows; strict JSDoc checks passed.

The positive property control was expanded from direct callback argument to five same-file value-flow forms in both modes:

1. direct: `queueMicrotask(hidden)`;
2. alias assignment: `const callback = hidden; queueMicrotask(callback)`;
3. object-field storage: `const holder = { callback: hidden }; queueMicrotask(holder.callback)`;
4. actual→formal forwarding: `forward(hidden)`, where `forward(fn)` passes `fn` to the host;
5. returned callback: `getCallback()` returns `hidden`, then the result is passed to the host.

Every case preserved exact `Function#toString` output for the callback, retained `owner.secretField`, renamed unrelated `other.unrelatedField`, preserved the runtime result, and emitted one property rewrite.

This is a useful positive control for the shared plan: it should not require a file-wide veto. The existing local property proof already handles these five same-file paths, while identifier and string consumers still rewrite source-visible formal/literal spellings of the same callable (run 45324800972). The issue is consumer inconsistency, not a demonstrated property false-negative for these five local cases.

Limitations: no cross-file ESM, arbitrary nested alias graphs, spread/apply/bind, mutable dispatch or full language-construct coverage. Full details are appended to `im-results/agent9-host-held-callable-source-observation-2026-11-24.md`.
