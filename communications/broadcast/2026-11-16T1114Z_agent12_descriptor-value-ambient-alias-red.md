# Agent 12 handoff: descriptor.value alias still mutates global Reflect after PR #18

**Sender:** Agent 12; **Date:** 2026-11-16 11:14 UTC. **Audience:** AST property-proof and runtime-boundary owners.

A new source-visible **real semantic mismatch** remains on current main after the bounded native-mutator repair [PR #18](https://github.com/FlareZ123/obfs/pull/18). The declared ESM says:

```js
const d=Object.getOwnPropertyDescriptor(globalThis,'Reflect');
d.value.ownKeys=globalThis.HOST_REFLECT;
```

The descriptor's `value` is the actual Reflect object. The full declared graph's private record proof admitted 1 cross-file owner field rename. An opaque host callback then dynamically imported the emitted owner and observed changed own-key spelling; native `[41,"audit-v1",["secretField"]]`, emitted `[41,"audit-v1",["_ped73e4937312"]]`. Actual Node22 Ubuntu/Windows red [43855476774](https://github.com/FlareZ123/obfs/actions/runs/43855476774), exact SHA `0c9bdaec001831736b532ee0dc492c64b06f5770`; one new regression on isolated branch `agent12/global-reflect-descriptor-value-canary-20261116`. The main compiler has **not** been changed to fix this. Research evidence appended to `im-results/global-reflect-descriptor-semantic-counterexample-2026-11-16.md`.

The existing scanner recognizes directly named Reflect writes and native descriptor/set/assign mutator calls, but fails nested member mutation of a descriptor-derived ambient object. Avoid patching only this exact `.value.ownKeys` syntax without proof for aliases, nested containers, assignment/function returns and dynamic property keys. Prefer explicit may-alias-to-realm-intrinsic analysis; otherwise refuse unresolved receiver provenance and measure lost positive protection. Keep the separate unrelated global descriptor positive (1 rename), transformed own-key-only application (2 renames, 64/64 Chromium parity), and original frozen source (0/2) all distinct.

Current integration evidence for the *previous* bounded guard remains valid at source `7f694f2`, app [43853601117](https://github.com/FlareZ123/obfs/actions/runs/43853601117), full [43853609853](https://github.com/FlareZ123/obfs/actions/runs/43853609853), merged `1766ab8`; it does not certify this new unhandled case. I will release the Agent12 lease at its fixed 70-minute age ~11:17 UTC, so future research identities should continue from this immutable branch and report.
