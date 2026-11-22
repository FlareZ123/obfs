# Design proposal: source-byte preservation at exact SRI target granularity

**Author:** Agent 30
**Date:** 2026-11-22
**Status:** Research proposal, not implemented, benchmarked or security-established.
**Scope:** COO/SCO browser publication bundles with statically identified local Subresource Integrity targets.

## Why this matters

The current `src/core.js` selects a single `remoteSourceObserver` boolean when either `hasPinnedLocalJavaScriptIntegrity(prepared)` reports a matching HTML SRI resource or any supplied script may observe another file's original bytes. That boolean suppresses cross-file property renaming and string encoding for the entire publication. Multiple source-pinned real-Chromium repairs, including PRs #259, #263, #300, #301 and #303, correctly favor byte parity in uncertainty. The consequence is a predictable loss of obfuscation yield for unrelated files when one identifiable script is hash pinned.

The static HTML analysis in `src/html-assets.js` already does substantial exact-path work: URL resolution against document and HTML base, route prefixes, encoded path support, portable Unicode/case aliases, Windows trailing-space/dot behavior, XHTML namespaces and XML base ambiguity. It returns only a boolean, discarding the target information that could support a narrower safe refusal. This design proposes reusing that validated resolver as a source-evidence classifier, rather than weakening any dynamic source observer.

## Evidence classes and decision rule

Use a three-way classifier result:

```js
/** @typedef {{kind:'none'} |
 *  {kind:'targets',paths:Set<string>} |
 *  {kind:'unknown'}} StaticSRIObservation
 */
```

`none` means the static HTML/XHTML documents contain no recognized SRI commitment on a distributed JavaScript target. `targets` is an explicit may-target set of every supplied file compatible with at least one resolvable pinned path, including all portable alias matches. `unknown` means an observed parser-supported SRI commitment could reach supplied source, but the exact target cannot be bounded safely. Do not downgrade an existing whole-graph veto into `none` merely because a URL proof is ambiguous.

Separately preserve `dynamicSourceObserver`: all current JavaScript source observations from `observesDistributedSource` and cross-file `observesFunctionSource`. The safe initial policy is:

```text
if dynamicSourceObserver or staticSRI.kind == unknown:
    publish the original source graph (existing behavior)
else:
    publish each file in staticSRI.paths unchanged
    apply existing local and cross-file transforms to other files,
    subject to their present safety and ownership proofs
```

The second clause is contingent on verifying that cross-file key and identifier rewrites do not silently modify the original SRI-pinned file or its public interface. Do not simply exclude its AST while renaming keys in consumers: mixed untouched/transformed edges require explicit preservation of all externally observable property contracts. A safe first candidate may therefore enable **string encoding on disjoint, unpinned files only**, with identifiers and all cross-file property renaming disabled. This isolates a measurable yield benefit while reducing implementation and proof complexity.

The host-lock wrapper changes output bytes and stack coordinates, so the first experiment must leave the existing group-wide `allowedHosts` rejection when any source-byte observer exists. Re-enable finer-grained locking only after a separately tested proof of target independence.

## Evaluation required before promotion

1. **Red yield control:** A static HTML document hash pins `client-a.js`; unpinned independent `client-b.js` contains a long string. The present compiler preserves both in a group. Require a candidate to preserve A exactly and transform B while retaining native execution parity. Measure emitted bytes and whether B is independently executable.
2. **True Chromium SRI triad:** Serve native, candidate and forced-byte-mutated A via the same actual HTML; prove native and candidate load, mutated A is rejected by SRI. B must execute with exactly the same side effects and cross-file interactions before and after protected emission.
3. **Cross-file edge controls:** A accesses a public export/property of B and vice versa, with direct ESM and classic scripts. Check mutable names, dynamic indexing, reflective operations, `import.meta`, source reading and Error.stack. If any existing observer is triggered, require full original graph.
4. **Alias closure:** Test case/NFC/NFD collisions, percent encoded path names, inherited base href, query/fragment, SCO mount prefixes, Windows trailing dots/spaces, XHTML namespace and XML-base ambiguity. All plausible compatible paths belong to the target set; unsupported XML base should retain the old full-graph veto.
5. **Equal-trust performance and protection:** Require >0 transformed unpinned bytes, no extra runtime instrumentation, two-platform all-suite validation and real Chromium. Do not claim any increase in confidentiality for unchanged A. Compare against an equal-trust baseline where only B is conventionally minified.

## Main risks and stopping rules

A native browser may reject SRI even if transformed A remains semantically equivalent. The exact source-byte commitment is non-negotiable. An unpinned B may be read by A through a source-API path that current observers miss; because the system has only bounded analysis, never promise universal soundness. Conservatively refuse if a new graph edge is not proved to preserve all public names and source-visible effects. If the measured yield advantage over ordinary minification is small, or compatibility tests expose any counterexample, leave the current coarse refusal intact.

This proposal strengthens obfuscation coverage for unrelated files under a narrow static-SRI assumption. It cannot solve the documented hostile-client extraction, SNO full-runner compromise, authenticated SCO relay or universal 2.5x limits. The primary release remains **RELEASE-BLOCKED**.
