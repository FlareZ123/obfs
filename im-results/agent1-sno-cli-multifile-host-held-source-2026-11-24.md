# Actual multi-file SNO CLI host-held callback: fail-closed group refusal

**Status:** Intermediate empirical finding; not an established release result.  
**Owner:** Agent 1  
**Date:** 2026-11-24  
**Scope:** Actual SNO CLI, two-file CommonJS input, one-entry launcher, Node 22 Linux/Windows.

## Summary

A real multi-file SNO CLI build with a CommonJS factory-returned callback preserves the exact source observed by a host-owned queueMicrotask override. This is **not** a successful selective transform: the current group-wide source-observer guard suppresses identifier transformations throughout the file group. An unrelated safe helper function remains completely untransformed.

This contrasts with the existing single-file SNO CLI witness, where the host-held callback source is rewritten. The current multi-file behavior is safe but coarse; it demonstrates a zero-yield fallback, not a source leak.

## Reproduction

- Test: test/agent1-sno-multifile-host-held-cli.test.js
- Manual-only workflow: .github/workflows/manual-sno-multifile-host-held.yml
- Pinned run: [45332078165](https://github.com/FlareZ123/obfs/actions/runs/45332078165)
- Test commit: 37dd4148453aff950ff5680bfa3668348405f8e6
- Result: both Ubuntu and Windows passed the actual CLI witness, strict project JSDoc, and strict external research JSDoc under Node 22.
- The workflow is workflow_dispatch only; no push/PR trigger was added.

The fixture creates:
- entry.cjs, the sole SNO launcher entry;
- helper.cjs, which exports getCallback() returning a private hidden function and also exports an unrelated safe function;
- a Node --require preload that replaces globalThis.queueMicrotask before application module evaluation.

The preload calls Function.prototype.toString.call(callback) and writes the observed source to a file. It does not invoke or schedule the callback. The application then calls the callback directly once, solely to compare native and emitted application results.

The actual CLI is run with --root, --out, --entry entry.cjs, and a deterministic seed. The generated sno-entry.cjs is executed as the single entry point. The test also verifies that the launcher's integrity manifest contains the SHA-256 digest of the emitted helper.cjs.

## Observations

Native and emitted application results are identical:

    {"result":3,"safeResult":13,"invocationCount":1}

The host-observed callback source is byte-for-byte identical between native and emitted runs:

    function hidden(inputValue){
      invocationCount+=1;
      const privateLocal=inputValue+1;
      return privateLocal;
    }

The source observer diagnostic reports:
- entry observesFunctionSource: true;
- helper observesFunctionSource: false;
- entry observesDistributedSource: false;
- helper observesDistributedSource: false.

The emitted helper still contains the original unrelatedValue parameter and safeLocal local variable. Thus the unrelated safe function receives no identifier-transform yield in this build.

The programmatic default obfuscateFiles result is byte-identical to the actual CLI helper output. A direct API diagnostic with string encoding disabled also leaves the helper unchanged. This localizes the behavior to the shared source-observer gate rather than a CLI-only launcher discrepancy or string-encoding startup behavior.

## Interpretation

src/core.js computes remoteSourceObserver across the prepared group. When the group has multiple files, a positive observesFunctionSource result in any file makes the group-level flag true. Identifier rewriting is guarded by !remoteSourceObserver; string encoding is guarded by the same flag. In this fixture, the entry's source-observer result therefore suppresses transforms in the otherwise non-observing helper.

This is a conservative safety result, not a source-observation mismatch. It is also an overbroad refusal: the observed callable and the unrelated safe function do not need the same source-preservation closure.

The exact minimal AST subexpression responsible for the entry's observesFunctionSource === true result remains unresolved. The test logs focused source-observer probes so a future investigation can isolate it without weakening the current guard.

## Relation to existing evidence

- Agent 9's single-file actual SNO CLI witness (run 45328981265) observes a changed callback parameter spelling.
- Agent 9's cross-file ESM factory-return tests show identifier/string source changes in the programmatic COO/SNO paths.
- This test covers a different bounded case: actual multi-file SNO CLI, CommonJS require factory return, one-entry launcher, and helper integrity manifest. Here the group-wide source-observer guard preserves the callback but also suppresses unrelated yield.
- The test does not establish that arbitrary CJS module graphs, ESM helpers under a CJS entry, cycles, dynamic imports, or every Node loader configuration behave the same way.

## Source identity

At the test commit, the following production blobs were compared with current main at 096e0180a814b65d941d46d66cad7f78be647d63; all matched byte-for-byte:

| File | Blob SHA |
|---|---|
| src/ast.js | c227e6e604635a42663af745fd0cfb194b215a67 |
| src/properties.js | bda3c6097e2679f59bd003fa0aed3e0291d4ba4c |
| src/identifiers.js | c7e2ed1469381c5bc6dc42cef9a6ca8bfa347f0f |
| src/strings.js | df489cf25a8aaeb87d90e6dc1b7eb66476da8dd6 |
| src/core.js | 8d33996821650de540b87502baff00a9e7ea99c7 |
| src/cli.js | 587398dbd070a809be92098f9df678ec7e5c23d2 |
| src/sno.js | 74bac83442ac11e57bf46e822385f408ba527399 |
| bin/sno.js | 26d28904e88cfb380dc5248c1c14862352a4ae41 |

No production compiler source was changed.

## Additional repository repair

jsconfig.external.json contained a missing comma between the final existing test entries, which prevented strict JSON parsing. The repair adds the missing separator, removes the trailing comma at the end of the include array, and includes the new CLI witness in the external JSDoc project. The final two-platform workflow passes npm run typecheck:external.

## Limits and next work

- This is a semantic-compatibility and transform-yield observation, not a confidentiality or integrity guarantee. The SNO threat model grants the attacker access to the Node filesystem, runtime, and memory.
- The host override is a controlled Node preload, not a Chromium browser fixture.
- The application invokes the callback directly once; the host override does not invoke it. There is no host callback invocation frame to represent.
- No runtime/compute benchmark was performed; no 2.5× claim follows.
- The next useful work is to isolate the minimal entry-side source-observer trigger and then replace the group-wide boolean with the shared per-callable source-observation/value-flow closure. The intended acceptance is exact source preservation for hidden while leaving safe eligible for identifier and string transforms where proven safe.
