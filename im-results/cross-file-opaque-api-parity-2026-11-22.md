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


## Follow-on real Chromium CSP observation matrix

At distinct exact source 888bc9b6ffc651e40e22e3932678c474aec81296,
the existing test/imported-constant-key-browser.js fixture matrix was
extended with nine independently observable owner cases: Proxy get-key
logging, JSON serialization, Map-returned owner reflection, WeakRef,
Promise callback, Array.of identity forwarding, ambient window.hostApi
method callback, Object.assign copied keys, and a separate ESM module's
read-only own-keys callback. Every new case requires zero unsafe
cross-file property rewrites and exact equality of native and obfuscated
values in a real browser, under
Content-Security-Policy: default-src 'none'; script-src 'self';
connect-src 'self'.

The unchanged earlier browser controls include six genuine positive
transformations and eight separate conservative refusals. The full
[Chromium run 45027258476](https://github.com/FlareZ123/obfs/actions/runs/45027258476)
passed *all steps* at the exact source SHA above. The imported-key
step's actual structured output was 23 cases, 6 positive,
17 refused, and 23 native-vs-generated comparisons, with success.
The overall browser workflow also executed its other existing SCO,
SRI, resource timing, decoder, runtime-interception and JSDoc checks.
This verifies that one source version only.

Browser CSP checks add a real-engine and ambient API boundary to the
Node-only corpus, but do not imply an instrumented hostile browser is
restricted or that attacker-cost resistance improved.


## Deterministic interprocedural transport/observer cross-product

A follow-on test, test/opaque-owner-transport-matrix.test.js at exact
source 35f7b28c5eafac92c8cb6a77d02d71f901e1436c, crosses
**eight transport mechanisms** (direct identity, array, record,
Map, Set, Promise, rest-parameter, and empty-handler Proxy)
with **five property-observation mechanisms** (Object.keys,
Reflect.ownKeys, Object.getOwnPropertyNames, JSON.stringify,
and for-in). It requires 40/40 conservative zero-rename decisions
and exact original/generated Node ESM behavior, including asynchronous
top-level-await forwarding. Sixteen deterministic seed/value variations
of the *same* independently proved imported-key source family require
strictly positive actual field rewriting and matching output.
These are 56 graph comparisons, not 56 unrelated program grammars.

The independently pinned manual focused
[Ubuntu/Windows run 45027652919](https://github.com/FlareZ123/obfs/actions/runs/45027652919)
passed both Node 22 jobs and both strict project/external JSDoc checks.
The Ubuntu log emitted
OPAQUE_OWNER_TRANSPORT_MATRIX with transports=8, observers=5,
refused=40, positive=16, comparisons=56 and measured 4077.94 ms
for the focused test. That is harness wall time, not protected
application compute cost. The experiment's result is finite
closed-world/host-API semantic parity, without a general proof or
incremental source-secrecy advantage over ordinary minification.
