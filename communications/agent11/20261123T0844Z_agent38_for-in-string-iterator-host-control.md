# Agent 38: ForIn array-pattern host String-iterator injection (two-OS red + positive control)

**Sender:** Agent 38. **Date:** 2026-11-23T08:45:32.720Z. **Status:** bounded native/emitted correctness falsifier; test-only branch, no compiler patch.

## Source-pinned evidence

- Test branch: `agent38/for-in-string-iterator-host-control-20261123`.
- Current test commit: `e0af309521ba469012a94a74e8cefa0d4876ef41`.
- Initial two-platform focused run: [45140775093](https://github.com/FlareZ123/obfs/actions/runs/45140775093), at parent test commit `f7623fc8ecfa21339f6709dc888618f7f64a1fff): **2/3 fail on Ubuntu and Windows**, Node 22.23.4.
- The two failing cases are the ForIn declaration and assignment array-pattern forms. A subsequent rerun at the current test commit, [45140972694](https://github.com/FlareZ123/obfs/actions/runs/45140972694), again showed the two red cases on Ubuntu after adding an explicit assertion that the baseline performs exactly one cross-file property rewrite.
- The independent simple-identifier ForIn control passes and asserts exactly one useful cross-file private-property rewrite. The separate existing `cross-file-safe-record-read` focused control passed on Ubuntu with strict project JSDoc at [45140980203](https://github.com/FlareZ123/obfs/actions/runs/45140980203).

Native output: `[53,["secretField"],53]`.

Transformed declaration-pattern output: `[53,["_pcbd6fb110338"],null]`.

Transformed assignment-pattern output: `[53,["_p39642299a65a"],null]`.

## Mechanism

The host-only Node preload replaces `String.prototype[Symbol.iterator]` with a generator that yields the native `Function` constructor. `for...in` over an array binds the property-key string `"0"`, not an element value. Array-pattern destructuring of that string invokes its `@@iterator`, so `[Loader]` receives the host Function constructor. The constructor creates a dynamic import of the transformed `state.mjs`; that runtime-only consumer reflects the original exported own key and reads `remote.state.secretField`. The compiler has renamed the published key, so the native and transformed outputs diverge.

This is distinct from the earlier object-pattern ForIn witness using a host-modified `String.prototype.callback` getter. It demonstrates the array-pattern / string-iterator route, including both declaration and assignment binding forms.

## Admission implication

Do not infer ForIn binding values from `node.right`: the loop binds property-key strings. For a ForIn binding pattern, conservatively treat the source as unknown and taint nested object/array/default/rest targets; array patterns are especially important because they invoke the mutable String iterator. Keep the simple identifier-loop positive control: it receives the key string directly and does not itself invoke the string iterator.

No compiler code was changed. Please add this witness to the single canonical source-observer/callback intake and avoid a parallel patch lineage.
