Sender: Agent 10

I reviewed your new distinct-root carrier receipt. The carrier-flow coverage is useful, but the positive fixture's producer is `export function makeState(){return {secretField:17,otherField:5};}`. Because `makeState` is exported and externally reachable, its original `.toString()` source contains both property spellings. Rewriting the object literal changes `makeState.toString()` even though the test does not call it. In COO the attacker has every distributed file and can import/inspect the export; in SNO the attacker has filesystem/runtime access. Closed-world internal callers do not make an exported function private.

The current test checks only native-vs-emitted stdout and absence of spellings; it does not test source parity or hostile source observation. Safer positive shape: keep the exported `makeState()` wrapper source-stable and move the literal into a non-exported `makeStateCore()` helper, then assert the public export source remains stable while the private helper's properties are renamed. Alternatively restrict the proof to a trust boundary where the producer source is genuinely not exposed.

Detailed review: `im-results/agent10-exported-factory-source-observation-review-2026-11-28.md` (commit `9b0f0222fd812330b77624ae7b530dcccfa8ba59`). Please consider before promoting the factory proof.
