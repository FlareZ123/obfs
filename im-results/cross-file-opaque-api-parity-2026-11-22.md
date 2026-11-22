# Cross-file opaque-owner API preservation: source-pinned Node differential

Date: 22 November 2026. Status: **intermediate compatibility evidence**.

## Question and test design

The compiler's own-property renamer must preserve externally observable key
spellings unless every relevant use is proved and rewritten. A test that
only asserts semantic parity after zero rewrites would be insufficient
to demonstrate positive compiler coverage. This experiment combines
a proved positive control with independent reflective/escape controls.

Exact source: bba8db824a8f09ec85550f04480fedb7c599121d.

Test entry: test/cross-file-opaque-api-contract.test.js.

The test builds fresh complete ESM graphs in temporary directories,
invokes obfuscateFiles in COO closed-world mode with strings:false and
identifiers:false, and executes original and generated main.mjs in
separate Node processes. It compares exit status, termination signal,
stdout, and stderr. Inputs are written using the existing locked atomic
writer; each tree is removed after each case. The dedicated imported
immutable-key positive control requires crossFile.properties > 0.

Eighteen source-observable/opaque cases require
crossFile.properties === 0: direct Reflect/Object own-key enumeration,
JSON serialization, object spread and Object.assign cloning, an
environment-selected computed key, Proxy property-name logging,
receiver callbacks, a returned cross-module alias, an imported
cross-module observer, a global callback, Map storage, WeakRef,
Promise resolution, rest and implicit arguments forwarding, Array.of,
nested-object aliasing, and Reflect.apply of Object.keys.
An additional rest-destructuring fixture checks parity without
assuming positive or negative rewrite yield.

## Reproduction and observed outcome

Use manual-validation.yml with focused_test set to
test/cross-file-opaque-api-contract.test.js.

- Original 12-case source-pinned control:
  [run 45026852085](https://github.com/FlareZ123/obfs/actions/runs/45026852085)
  at b4776f5e08012e831fc81755787d29b60803921f, both Ubuntu/Windows
  jobs succeeded, including strict JSDoc.
- Expanded 20-case two-platform gate:
  [run 45026968161](https://github.com/FlareZ123/obfs/actions/runs/45026968161)
  at bba8db824a8f09ec85550f04480fedb7c599121d. Ubuntu
  Node 22.23.4 **20/20 pass, zero failures**; Windows Node 22
  **20/20 pass, zero failures**. Both strict project and external JSDoc
  checks succeeded. Ubuntu reported 1567.71 ms for the focused test
  process, which is harness wall time rather than application overhead.

## Interpretation and limitations

These observations support bounded transformation safety for the
tested external-property cases and retained positive yield on
one proved cross-module owner. They do **not** establish complete
alias closure, arbitrary JavaScript semantic identity, hostile-runtime
integrity, source secrecy, instrumentation resistance, environment
admission, or compliance with the 2.5x compute budget.

No ordinary-minification attacker-cost control or browser run is included
in this focused suite; those remain independent release gates.
The top-level release decision stays **RELEASE-BLOCKED**.
See [closed-world proof contract](../docs/CLOSED_WORLD_PROPERTY_PROOF.md)
and [release decision index](../results/README.md).
