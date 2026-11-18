# Exported immutable reader: out-of-graph host calls change semantics after local owner rewrite

**18 November 2026, Agent 8. Classification: independently executed default-compiler semantic counterexample and conservative repair.**

## Threat-model and source boundary

A closed-world local property proof may establish that every *declared* call to an immutable helper receives the same private record, while the JavaScript module itself publicly exports that helper. External consumers can call a public helper with a different object and inspect the function's source; that public contract exists even if consumers were not supplied in the compiler input.

The independent Node ESM fixture in `sims/exported-reader-host-argument-attack.js` gives the compiler only:

```js
const privateRecord={secretAlpha:23};
export const read=input=>{
  const value=input.secretAlpha;
  return value;
};
export const get=()=>read(privateRecord);
```

The host runner outside the supplied file group imports `read` and `get`, checks `get()`, calls `read({secretAlpha:71})`, and checks whether `read.toString()` retains the spelling `secretAlpha`. The compiler's `closedWorld:false` option is deliberate: there is no claim that the exported module exhausts its consumers.

Before repair, `proveLocalObject` treated an `export const` helper's initializer as a private, immutable function when all *source-visible* direct calls passed the private owner. The source's sole direct call `read(privateRecord)` satisfied that local condition. Although the pre-existing function-declaration branch already refused an exported declaration, the immutable variable branch only refused exported zero-argument getters returning the complete owner. It did not protect other directly exported functions.

## Reproducible differential and fix

At exact pre-fix source `6378605d8f28d8201aafd7b705eefe039272a224`, [GitHub Actions run 44246644729](https://github.com/FlareZ123/obfs/actions/runs/44246644729) executed the actual independent native/emitted Node ESM host differential on Windows for **COO, SNO and SCO**:

| Observation | Native | Emitted before repair |
| --- | --- | --- |
| `get()` | 23 | 23 |
| `read({secretAlpha:71})` | 71 | `undefined` |
| `read.toString().includes('secretAlpha')` | true | false |
| Selected own-key rewrites | n/a | **1 per mode** |

The source artifact was genuinely altered; its unchanged `get()` value alone would have hidden the external-contract violation. These observations are compiler semantic results under a public host contract, distinct from anti-obfuscation attacks performed by a malicious runtime.

The bounded repair in `src/properties.js` now invalidates a locally tracked immutable helper when its binding itself is defined under `ExportNamedDeclaration`. This admits only helpers whose call contracts are private to the declared relevant scope. Directly exported function declarations, `export {helper}` aliases and observed function references already had other conservative refusal paths; the repair aligns direct immutable exports with that policy.

Running `node sims/exported-reader-host-argument-attack.js --expect-guarded` after the repair obtains **zero** renamed private fields and full host-result/source parity for COO, SNO and SCO. The Windows job in [post-fix run 44246837317](https://github.com/FlareZ123/obfs/actions/runs/44246837317) contains exact `EXPORTED_READER_HOST_ARGUMENT` lines showing `71` retained and `readableSource=true` in all three modes. The overall workflow was red **later** in a separate stochastic Windows cold-CPU budget step; all preceding semantic differential and hot-CPU assertions passed. The strict cold >2.5x observations remain recorded as budget counterevidence.

## Limits and future work

This repair deliberately sacrifices a potential safe own-field rewrite when a public helper is exported. A stronger cross-module analysis could restore such protection only where the complete external caller set, exported source observations and foreign receiver shapes are independently proved. An integrator-provided `closedWorld:true` flag is insufficient for a known exported API unless that contract truly includes its consumers.

The separately admitted two-statement **private** helper remains a positive property-renaming case under its existing no-escape and alias proof. It has no demonstrated incremental functional-cloning resistance over an equal-trust conventional minifier, and no universal 2.5x bound. A public-only label normalizer already preserves its outputs on the frozen fixture.

The main strong-protection release decision remains **blocked**. This finding resolves one concrete compiler-correctness risk without claiming the larger security objective is complete.
