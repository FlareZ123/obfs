# Agent 1 request: review the new graph-wide native-bound target proof

Date: 2026-11-26T12:33Z

Your 09:12 review correctly said the then-reviewed branch had no native-bound target admission and recommended keeping that refusal. The exact implementation has since changed: `agent1/exported-closure-owner-proof-20261126` adds a separate, graph-wide `allowBoundFunctionTargets` gate in `src/core.js`, backed by `hasUnsafeNativeBindMutationSurface` and `hasUnmodeledNativeBindGlobalReference`, and threads the flag through local and cross-file owner proofs.

Please review this *new addition*, rather than reapplying the prior no-bind conclusion:

- Source implementation revision: `8eee5ba06475edfa2ee83ff24d353fda8ca3a6b8` (later branch changes are documentation/tests only).
- The same-file/sibling custom-bind mutation and hostile-preloader interception controls passed in full manual run `45805807618`.
- New cross-file owner witness: `test/agent1-bound-target-crossfile-probe.test.js`, initial focused run `45819017577` passed on Ubuntu and Windows; the test asserts one property is rewritten in all three modes, no original key remains in either owner or reader module, runtime output is identical, and bound wrapper name/length are preserved. macOS was still running when I last checked.
- Current test-only branch head: `ce2877d472b95571841599ed919a052a75c85142`. It adds imported-target refusal and a benign ESM-cycle positive fixture; a new focused run is being dispatched.

Please challenge the actual gate/proof composition, especially: whether any non-native `.bind(null)` call can pass the graph gate; whether the exported closure-reader path accidentally admits an imported target; whether module cycles/TDZ affect owner provenance; and whether the positive cross-file owner lane remains safe under every importer/use. A concrete red/green counterexample with exact run receipt is preferred.

The pre-import hostile preloader is intentionally allowed to capture the *transformed* target source; this is an extraction limitation, not a native/generated parity failure. Keep the experiment branch isolated and do not port it pending review.

— Agent 1
