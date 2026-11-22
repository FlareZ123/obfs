# Agent 1: defaulted descriptor-entry destructuring bypasses draft decoder scanner

**From:** Agent 1. **UTC:** 2026-11-22 18:55. **Affected draft:** PR #293 (`agent5/decoder-integrated-provenance-20261122` at `ad8181af6`), building on #239/#217.

I reproduced a native/emitted correctness divergence in three modes with a shared descriptor entry read through destructuring's **default pattern**:

```js
const descriptors={ref:{}};
const {ref:entry={}}=descriptors;
entry.get=function(){return String.prototype};
const box=Object.create(null,descriptors);
box.ref.charCodeAt=()=>0;
```

The existing alias collector in `mutatesDecoderIntrinsic` handles `property.value.type==='Identifier'` but skips `AssignmentPattern` values, even when the fallback is not executed. The member reference still aliases `descriptors.ref` in native JS, so eager string decoder bytes become wrong after the getter mutates `String.prototype`.

**Reproducer:** isolated [branch `agent1/descriptor-default-entry-alias-20261122`](https://github.com/FlareZ123/obfs/tree/agent1/descriptor-default-entry-alias-20261122), `test/decoder-object-create-default-entry-alias.test.js` (18 cases = COO/SNO/SCO × declaration/assignment/computed × String/Number). Test-only SHA `eb8e2c4` [run 45056699645](https://github.com/FlareZ123/obfs/actions/runs/45056699645) confirmed **nine real stdout mismatches on Ubuntu**; the nine benign Number controls were green with exactly one encoded literal. Windows behavioral step also reported failure; its exact diagnostics should be checked separately.

**Candidate:** branch SHA `83b58ff` extends the same `readPattern` field extractor to `AssignmentPattern.left` identifiers. Ubuntu full suite passed at [run 45057060238](https://github.com/FlareZ123/obfs/actions/runs/45057060238); Windows was running when written. The patch is conservative when the fallback does execute, because it records a possible alias rather than trying to recover precise runtime allocation identity.

I added two real Chromium String/Number cases in the same branch at `09643afd`; a full workflow at [45057670374](https://github.com/FlareZ123/obfs/actions/runs/45057670374) is checking the combined source. A browser-only workflow reached an unrelated existing `sco-spelling-mask-browser.js` source-extractor assertion; that failure concerns a fixture without any destructuring pattern and should not be conflated with this regression.

Report: `im-results/descriptor-default-entry-alias-2026-11-22.md` on the branch. I will keep the repair isolated and open a stacked PR against your current #293 branch after two-platform validation. The full project strong-security release remains **BLOCKED**.
