# Exported native Object.create callable: cross-file descriptor-map provenance counterexample

**22 November 2026, Agent 5.** Intermediate behavior-parity evidence for COO, SNO and SCO. No universal secrecy claim; primary release **RELEASE-BLOCKED**.

## New uncovered source shape

A module may export the native `Object.create` callable and another module may load that callable before the encoded target module initializes:

```js
// factory.cjs
module.exports=Object.create;

// mutator.cjs
const make=require('./factory.cjs');
const box=make(null,{ref:{get(){return String.prototype}}});
box.ref.charCodeAt=()=>0;

// entry.cjs
require('./mutator.cjs');
process.stdout.write(require('./target.cjs'));
```

The original target is a 2,049-character literal. When source-visible descriptor-map access to `String.prototype` becomes available only through an imported unknown call target, a per-file scanner may fail to associate the setter with the exported native callable and incorrectly enable eager ambient `charCodeAt` decoding in the target. Native source writes the original literal; the transformed output can decode gibberish because its runtime reads poisoned `String.prototype.charCodeAt`.

## Frozen red evidence

The independent test-only branch `agent5/exported-native-create-probe-20261121` contains `test/decoder-crossfile-native-create-export.test.js`, with three export routes: CJS direct native function, CJS `module.exports={make:Object.create}` plus consumer destructuring, and ESM named export of native `Object.create`. Each unsafe `String.prototype` descriptor has a matched benign `Number.prototype` control that must still emit one encoded literal and preserve exact native output.

Source `6dd6ce02c8cf73334fcdb8e13c54c5c63a150a0c`, [two-platform full CI run 44964073219](https://github.com/FlareZ123/obfs/actions/runs/44964073219): Ubuntu produced **seven distinct actual native/emitted stdout mismatches**, exactly one per unsafe source/mode combination: CJS direct export COO/SNO/SCO; CJS holder export COO/SNO/SCO; ESM named export COO. All seven benign Number controls passed. This is a runtime-differential result rather than an analysis heuristic. The **Windows** job independently reproduced the **same seven distinct actual native/emitted mismatches**, with all matched benign Number controls passing. Thus this red outcome is source-coincident and cross-platform.

## Proposed fail-closed repair

The experimental source pin `adc0a03a66ca47af0fdbc5dbef581b35deedce3b` adds a conservative unknown-call site check: a second argument that locally proves a decoder-sensitive descriptor map, including aliases/factory results already tracked by the existing scanner, forces refusal of eager ambient decoder encoding when the call target may be imported from another file. This protects against source-visible `Object.create` and `Object.defineProperties` API shapes without pretending to resolve an opaque imported function identity.

The checker does not reject benign descriptor maps returning `Number.prototype`; the fixture requires positive encoding yield to protect against universal disable. A following commit `4f4a2b1df17aa98ddf0a08320f8c1ecf115386b9` registers the new test under strict external JSDoc. [Full two-OS CI 44964439042](https://github.com/FlareZ123/obfs/actions/runs/44964439042) was **pending** when this report was written.

The repair deliberately trades a possible false refusal when an opaque unrelated function receives a sensitive-looking descriptor map for proven native/emitted correctness under the stated open-world callback threat model. It leaves source-runtime execution semantics intact; only unsafe string encoding is suppressed. The global 2.5× CPU bound is still unproved.

## Integration gate

If both operating systems and strict type checks pass, merge the narrow source+test+external typecheck differences into the existing stacked [draft PR #239](https://github.com/FlareZ123/obfs/pull/239) only after a **new single-head full two-OS run**. Do not treat the earlier green [44963918073](https://github.com/FlareZ123/obfs/actions/runs/44963918073) as evidence for this uncovered source shape: that older source passed the then-existing tests and provably failed the new independent graph. Preserve its green status for its narrower scope.

The case does not demonstrate new confidentiality/tamper-resistance under a hostile runtime. It establishes a concrete missing cross-file JS semantic guard.
