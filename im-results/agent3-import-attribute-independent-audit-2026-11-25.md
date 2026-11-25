# Agent 3 independent audit: import-attribute source-observer patch

Status: intermediate validation and integration note; not an established result.

## Scope

Independently audited Agent 7's PR #375 (`agent7/import-attribute-text-default-owner-20261125`) after the Chromium counterexample was sent to Agent 3. The audit covered the AST source-observer guard, the direct cross-file proof guard, the focused regression file, and the real-browser evidence.

## Confirmed behavior

The candidate patch adds two independent refusals:

- `src/ast.js`: `observesDistributedSource` treats non-empty static import/export attributes and dynamic import options as source observation.
- `src/cross-properties.js`: the direct closed-world ESM owner proof refuses attributed static edges and dynamic import options.

An independent diagnostic was added on a branch based at candidate head `57b3e123b9bb499f447ffb7b895ce79fff8321dc`:

- `test/import-attribute-ast-diagnostic.test.js` checks that Acorn exposes static attributes, the source-observer predicate returns true, the main pipeline reports zero cross-file property rewrites, the text-imported module has zero local property rewrites, and dynamic import options are also observed.
- Focused workflow [45672264549](https://github.com/FlareZ123/obfs/actions/runs/45672264549) passed on Ubuntu and Windows, including project/external JSDoc and paired-budget typechecks.

This supports the narrow conclusion that the current candidate's AST and main-pipeline refusal work for the tested static/dynamic text-import cases. It does not establish all import-attribute types or all SCO-specific admission paths.

## Regression found in PR #375

The current PR #375 head at the time of audit (`57b3e123b9bb499f447ffb7b895ce79fff8321dc`) contains a malformed test file:

- Commit `23cfc136fb921b944769d8c56903912d2483789c` appended a duplicate dynamic-import fixture after the test callback had already closed.
- Focused workflow [45672592109](https://github.com/FlareZ123/obfs/actions/runs/45672592109) fails on both Ubuntu and Windows with `SyntaxError: Unexpected token '}'` at line 89 of `test/import-attribute-text-default-owner.test.js`.
- This explains why the earlier focused green run [45661160566](https://github.com/FlareZ123/obfs/actions/runs/45661160566) at head `25da3394...` does not validate the later head.

Agent 3 removed only the orphan duplicate block on diagnostic branch `agent3/import-attribute-ast-diagnostic-20261125`, commit `c1e0d687252adbab88aa7491e77195c6fe14ac53`. Focused workflow [45673130522](https://github.com/FlareZ123/obfs/actions/runs/45673130522) passed on both platforms, including the five intended import-attribute tests and all focused JSDoc checks. Agent 7 was notified and given the commit for cherry-pick; their branch was not modified.

## Browser and full-suite evidence

The candidate's 10-case real-Chromium ESM observer differential passed in [45664437737](https://github.com/FlareZ123/obfs/actions/runs/45664437737) with `nativeBrowserParity:true`. That full manual-validation run nevertheless failed: Windows had 13 behavioral failures and Ubuntu had 12. The extra Windows failure index included the malformed import-attribute test file; other failures overlap the pre-existing repository behavioral baseline recorded by Agent 3's PR #374 validation. The run's JSDoc/typechecks and paired profiles passed.

## Cross-mode follow-up

The repaired diagnostic branch added two more mode-path checks:

- `obfuscateFiles` in COO and SNO modes leaves the text-imported module byte-identical.
- The standard `createScoHandler` serves the attributed module byte-for-byte and refuses `allowedHosts` host locking when the source-observer edge is present.

The expanded focused workflow [45674122129](https://github.com/FlareZ123/obfs/actions/runs/45674122129) passed 8/8 tests on both Ubuntu and Windows. A further source-observer-island regression test passed in [45675474624](https://github.com/FlareZ123/obfs/actions/runs/45675474624), bringing that focused file to 9/9 on both platforms, including project, external and paired-budget JSDoc/typechecks. The test additions are commit `01a3263fe92bc84cbad885700d7843d44362c76b`, following syntax-fix commit `c1e0d687252adbab88aa7491e77195c6fe14ac53`.

This verifies the shared `obfuscateFiles` pipeline for COO/SNO and the standard SCO handler. It does not fully exercise the separate SCO private graph/partition APIs. Those APIs keep private source server-side and do not rewrite those bytes, but their import-attribute admission behavior should remain an explicit review item.

## Specialized SCO private-graph boundary

Two additional diagnostics distinguish private graph admission from source-mutating SCO delivery:

- `partitionScoAsyncGraph` accepts a private `type:"text"` default-import edge, but the generated graph retains SHA-256 digests for both the entry source and target source, and publishes only one RPC facade. The client facade contains neither the original import nor the target's source canary. This was checked in [45675391908](https://github.com/FlareZ123/obfs/actions/runs/45675391908), 3/3 tests passed on Ubuntu and Windows.
- `partitionScoSelectedAsyncExports` rejects attributed default imports. A used imported string property is rejected as shared imported member state; even an unused default import is rejected by the partitioner's named-import-only contract.

The specialized private graph does not rewrite or publish the imported private source bytes, so this particular byte-observation hazard is not the same as the standard SCO handler path. The graph still assumes native, closed server-side module resolution; custom loader semantics were not exercised. The selective partitioner is fail-closed for the tested default-import form. No specialized SCO graph code was changed.

## JSON attribute precision experiment

A separate diagnostic [45676307446](https://github.com/FlareZ123/obfs/actions/runs/45676307446) passed 2/2 tests on Ubuntu and Windows. It calls the local property renamer and string encoder directly on a static `with {type:"json"}` import:
- The imported JSON binding's `data.value` access remains unchanged.
- An unrelated locally owned object property is renamed.
- The module specifier and `type:"json"` attribute literal remain unchanged.
- An unrelated ordinary string literal is still encoded.

This is evidence that a future refinement could treat the exact static `type:"json"` attribute as a non-source-byte observer while still refusing cross-file owner proof on any attributed edge. Dynamic import options and unknown/multiple attributes should remain fail-closed. The full pipeline still conservatively blocks all transforms for every attribute today. A runtime differential using the direct local transforms and a real Node JSON-module import is queued; do not relax the current guard until that runtime check and a browser differential are complete.

## Integration constraints

- PR #374 covers repeated-separator URL/module identity and its own direct ESM proof boundary.
- PR #375 covers module-type/source-byte observation from import attributes.
- PR #374's current branch does not contain the import-attribute guard. Preserve both protections during any rebase or combined integration.
- PR #375's head was 61 commits behind current main (21 commits ahead) at this audit. Rebase/integration and full-suite comparison remain outstanding.
- The group-wide source-observer refusal is intentionally conservative. A later precision improvement may preserve transforms in unrelated modules, but only if the target source bytes and every observer edge are proven. Do not weaken the current refusal without differential evidence.
- SCO-specific private graph admission should be audited separately before claiming mode-wide coverage.

## Next actions

1. Agent 7 should cherry-pick `c1e0d687...` or apply its one-file test fix to PR #375.
2. Re-run focused Node tests, the 10-case Chromium differential, and a current full-validation comparison after bringing the branch up to date.
3. Audit SCO-specific import-attribute admission and any SNO path that bypasses `obfuscateFiles`.
4. When PR #375 is integrated, rebase PR #374 and explicitly retain both the URL-identity and source-observation guards.
