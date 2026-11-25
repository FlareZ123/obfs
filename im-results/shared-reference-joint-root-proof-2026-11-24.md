# Intermediate validation: joint imported-owner root-set proof

**Status:** intermediate candidate evidence only. This is not an established result, not a comprehensive acceptance receipt, and not a release unblock.

## Source-pinned candidate

- Repository: `FlareZ123/obfs`
- Donor branch: `agent7/shared-reference-property-proof-20261124`
- Tested commit: `1c6127a2d1cb7126286e6f02b1399e499f361dd7`
- Relevant implementation: `src/properties.js` extends `proveLocalObject` to seed a joint root-alias set; `src/cross-properties.js` supplies all named import aliases of the same exported owner in one importer proof.
- Relevant regression suite: `test/cross-file-reader-flow.test.js`

The implementation distinguishes disjoint direct reads from interacting aliases. A single proof is seeded with sibling import bindings when they participate in one carrier or one local-reader callsite set. It must reject the whole owner if any sibling alias escapes.

## Focused test evidence

Workflow: [manual-cross-readers run 45511190284](https://github.com/FlareZ123/obfs/actions/runs/45511190284), triggered on the exact commit above.

Both Ubuntu and Windows logs contain and pass the new controls:

1. sibling imports of one owner occupying multiple private record slots;
2. one local reader consuming sibling aliases of one imported owner;
3. an escaped sibling owner alias vetoing shared-owner renaming;
4. duplicate imports of one owner with direct reads through both aliases;
5. query-distinct ESM URL refusing direct-read renaming.

The workflow's cross-file differential/negative command passed **443/443** on both OS. The separate host-lock test command passed **38/38** on both OS.

Compared with current main `51f98a6ee580ed62857ec3796da52c81205b0772`, this tested donor is **26 commits ahead / 121 behind**, with merge base `bd8ff7245b2bde60186927e0c5ae39ff82b0b8f1`. Only three files differ from that merge base: `src/cross-properties.js`, `src/properties.js`, and `test/cross-file-reader-flow.test.js`. The focused green therefore applies only to the older source-pinned tree.

These are Node test results. They establish useful source-pinned behavioral evidence for the joint-root proof, but not browser parity or full release acceptance.

## Separate workflow failure

The overall workflow remains red later at step 9:

- File: `examples/closed-graph-host/build-sample.cjs`
- Expected cross-file stats: `{objects:1,properties:2}`
- Actual cross-file stats: `{objects:0,properties:0}`

The fixture's `logic.mjs` exports a `read()` function that closes over the imported owner. The current proof admits only private direct-call-only function values for this captured-owner flow; an exported function is not in `privateFunctionNodes`. This zero-rename outcome is consistent with the current conservative source-observation boundary. The same step-9 failure was present in earlier runs 45508804936 and 45509635199, so it predates the joint-root implementation.

Do not weaken the source-observation guard merely to satisfy the old golden count.

## Browser and performance gaps

- `test/closed-graph-host-browser.js` exercises host locking in Chromium using the same host fixture, but currently does not test property renaming because the exported reader closure is refused.
- The Chromium steps occur after the failing step 9, so they are not reached in run 45511190284.
- A possible fixture repair is to retain `logic.mjs` as a side-effect dependency, remove its exported reader, and define a local, non-exported reader in `entry.mjs` that is called only after host authorization. This could preserve the `state, logic, entry` event order while allowing the existing Chromium test to exercise renamed fields. This proposal has not been tested.
- The 443-test suite is not a runtime compute-ratio measurement. No 2.5× performance claim follows from it.

## Integration disposition

Keep this as a donor branch, not a parallel PR. Route any intake through Agent3/Agent1 into the existing PR #372 funnel. PR #372 remains draft until its separate exported-instance source-observation escape is fixed and the comprehensive current-main acceptance gate is rerun on the exact integrated head. Acceptance owner Agent10 has been informed of the focused evidence and outstanding browser/fixture gates.

**Conclusion:** the joint imported-owner proof is promising and passed its focused Node differential suite on two operating systems. It remains a candidate requiring browser validation, fixture disposition, integration, and full acceptance.
