# Public callable source blocks otherwise valid local Symbol-key rewriting

**Agent 26, 23 November 2026. Intermediate, host-observable semantic
falsifier.** This reproduces an incompatibility of forcing the repository's
opt-in private Symbol-key rewrite on an object whose **method caller** is
published. It helps interpret three existing full-suite positive-yield
regressions. It neither adds an obfuscator backend nor demonstrates secrecy.

## Exact native Node observer

The test deliberately runs the same two-stage construction in CommonJS and
ESM:

1. Construct an internal object with two primitive named fields and an
   otherwise private function that mutates and reads those fields.
2. Compile **only the private body** with 'symbolizeLocalProperties'.
   Both formats generate exactly two real local unregistered 'Symbol()'
   keys and rewrite their accesses. This is the positive control: the
   transformation is real and its execution values remain identical.
3. Afterwards, publish the already-transformed function via
   'module.exports=calc' for CommonJS or 'export {touch}' for ESM.
   This demonstrates what would happen if the private-body proof were
   incorrectly carried into a public callable context.
4. Independently load the original published module and the forced-output
   module from distinct real Node filesystem paths. An external consumer
   obtains the exported functions, calls the unmodified native
   'Function.prototype.toString' and compares exact native outputs for
   2, 4, -3, 13 and 0 in sequence.

The outputs remain exactly equal under 'Object.is', but the source observed
by the external consumer is **different**. In particular, original
'calc.toString()' contains 'bag.pulse' while the forcibly transformed
version contains a generated 'bag[_sk_...]' access. The ESM consumer likewise
sees 'privateState.pulse' in the original 'touch' source and a generated
computed Symbol property in the transformed function source. There is no
debugger monkey patch, source-map artifact, private file read or
attacker-generated replacement involved in this observer.

When supplied the *actual published source* before proving the owner,
the current opt-in Symbol-key backend conservatively returns
'properties:0' for both formats. Under the full context, that refusal
preserves the native Function#toString observation. The positive
'properties:2' from the private-only source does **not** license the edit
after the callable becomes externally observable.

## Immutable run

- Executable source: 'test/symbol-keys-public-source-boundary.test.js' on
  [Agent 26's isolated proof branch](https://github.com/FlareZ123/obfs/tree/agent26/symbol-keys-public-callable-source-20261123),
  source SHA '45500b6009f31e32b2339e30534daf301dfa3f2c'.
- [Focused two-platform Actions 45149405697](https://github.com/FlareZ123/obfs/actions/runs/45149405697)
  **passed both test cases on Ubuntu and Windows**, with strict project,
  external and paired-budget JSDoc check steps all successful.
- Both platforms logged these complete bounded witness fields for both CJS
  and ESM: 'privateProperties:2', 'publishedProperties:0',
  'sourceIdentical:false', 'behaviorEqual:true'. The test checks external
  native module loading and function-source difference before printing.
- The positive and negative versions use the same seed per format.
  The actual final Symbol key spelling is public and irrelevant to the
  source-boundary observation.

## Impact on frozen full-suite positive-yield inventory

The earlier [18-case frozen-main failure inventory](mainline-full-validation-2026-11-23-0721.md)
includes 'symbol-keys.test.js' positive expectations under three cases:

- **Local Symbol mutation proof:** the source assigns 'module.exports=calc'
  while 'calc' reads and writes 'bag.pulse' and 'bag.mask'.
  Rewriting them changes externally readable native 'calc.toString()'.
- **Real ESM two-file caller:** 'state.mjs' exports the function 'touch',
  whose source text contains 'privateState.pulse' and 'privateState.mask'.
  An unknown importing consumer can call the same native source observer,
  even though the included 'entry.mjs' fixture checks only printed numbers.
- **Generated example byte reproduction:** the historical
  'examples/symbol-keys/before.cjs' publishes exactly the same 'calc'
  function as the first case. Its committed 'after.cjs' includes private
  Symbol keys and computes the same values, but it changes native
  'calc.toString()'. A test that expects the obsolete output bytes to be
  regenerated without source-observation admission is therefore unsafe.

This is a scoped falsification of the **positive-yield expectations**,
not a request to remove the tests or blindly change expected counts. The
acceptance owner should first decide the intended contract: if complete
external native-source compatibility is required, these exact public-callable
inputs should become negative/refusal controls, and a separate,
independently private and verified owner fixture should carry any
positive-yield coverage. If the intended contract excludes observable
exported callable source, that narrower exclusion must be explicit and
tested by a distinct opt-in mode. Altering the compiler just to restore
the historical positive counts without an observer proof would reintroduce
a semantic regression.

## Limits

This witness is finite and specific: simple primitive own fields,
one exported function, ordinary native Node22 CJS/ESM loading and
Function#toString. It does not show that all Symbol-key transformations are
unsafe; the verified private-only positive proves the local edit is possible.
It also does not settle source observability through stack capture,
proxies, getters, dynamic imports of other graphs, or deliberate hostile
runtime tampering. It says nothing about static reconstruction advantage
over a matched minifier, the 2.5× compute budget or release eligibility.

**Disposition:** retain the compiler's public-callable refusal pending
a source-observer proof. Coordinate any fixture update with the canonical
source-observer and full-suite acceptance owners. Overall release remains
**RELEASE-BLOCKED**.
