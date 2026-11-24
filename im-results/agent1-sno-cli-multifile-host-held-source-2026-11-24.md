# Actual multi-file SNO CLI host-held callback: CommonJS factory-return source leak

**Status:** Intermediate empirical finding; not an established release result.  
**Owner:** Agent 1  
**Date:** 2026-11-24  
**Scope:** Actual SNO CLI, two-file CommonJS input, one-entry launcher, Node 22 Linux/Windows.

## Summary

The actual multi-file SNO CLI rewrites the source of a private callback returned from a CommonJS helper factory and passed to a host-owned queueMicrotask override. The host reads Function#toString and never invokes or schedules the callback. The application result remains unchanged.

The unrelated safe helper is also transformed. This is a confirmed cross-file HostHeldCallable source-preservation gap in the actual SNO CLI path, not merely in the programmatic API.

## Reproduction

- Test: test/agent1-sno-multifile-host-held-cli.test.js
- Manual-only workflow: .github/workflows/manual-sno-multifile-host-held.yml
- Final pinned run: [45333011035](https://github.com/FlareZ123/obfs/actions/runs/45333011035)
- Test commit: aecd6a3812518e97ba37bf764df7118e40be0c2c
- Result: both Ubuntu and Windows passed the actual CLI witness, strict project JSDoc, and strict external research JSDoc under Node 22.
- The workflow is workflow_dispatch only; no push/PR trigger was added.

The fixture creates:
- entry.cjs, the sole SNO launcher entry;
- helper.cjs, which exports getCallback() returning a private hidden function and also exports an unrelated safe function;
- a Node --require preload that replaces globalThis.queueMicrotask before application module evaluation.

The preload calls Function.prototype.toString.call(callback) and writes the observed source to a file. It does not invoke or schedule the callback. The application then calls the callback directly once, solely to compare native and emitted application results.

The actual CLI is run with --root, --out, --entry entry.cjs, and a deterministic seed. The generated sno-entry.cjs is executed as the single entry point. The test verifies that the launcher's integrity manifest contains the SHA-256 digest of the emitted helper.cjs.

## Observations

Native and emitted application results are identical:

    {"result":3,"safeResult":13,"invocationCount":1}

The native host-observed callback source contains the original inputValue and privateLocal identifiers. The emitted callback source differs and no longer contains either original spelling. The test asserts this directly.

The emitted helper also no longer contains unrelatedValue or safeLocal. Thus the compiler transforms both the host-observed hidden callback and the unrelated safe function. The current implementation does not preserve a per-callable source closure for the callback.

The programmatic default obfuscateFiles result is byte-identical to the actual CLI helper output. The helper digest is present in the single-entry launcher manifest. Runtime value parity, launcher integrity metadata, and host non-invocation are independently asserted.

## Important fixture correction

An earlier version of this test appended a newline using string concatenation:

    process.stdout.write(JSON.stringify({result,safeResult,invocationCount})+'\\n');

That caused observesFunctionSource(entry) to return true even though the queueMicrotask-only, CommonJS factory-return-only, and related isolated probes returned false. The core's group-wide remoteSourceObserver guard then withheld transforms from every file, creating a misleading fail-closed result.

The isolated processJsonPlusNewline probe returns true; the actual test now writes JSON without concatenating a newline. This removes that unrelated source-observer trigger while preserving the tested application values. The corrected entry has no positive source-observer result, and the actual host-held callback source is rewritten.

This correction is important: the previous fail-closed interpretation was a fixture artifact and is superseded by the final run 45333011035.

## Interpretation

The entry passes a callback returned by helper.getCallback() to the host-owned queueMicrotask override. The entry-side observesFunctionSource predicate does not recognize this cross-file CommonJS factory-return flow. The helper's own source-observer predicate is also false. Consequently, the multi-file remoteSourceObserver group gate does not activate, and identifier rewriting proceeds in helper.cjs.

The observed callback source changes even though the host never invokes the callback. There is no host ActiveFrame edge. The application's later direct call is a separate ordinary call site and accounts for invocationCount === 1.

This is a concrete reason to propagate HostHeldCallable/SourceObservable facts through CommonJS module resolution, module exports, factory return-to-call-result, local alias, and host-argument edges. The exact source closure of hidden must be consumed by identifier and string transforms; the unrelated safe function should remain eligible for transforms where proven safe.

The processJsonPlusNewline probe is a separate conservative source-observer false positive. It must not be mistaken for evidence that the compiler recognized the host-held callback.

## Relation to existing evidence

- Agent 9's single-file actual SNO CLI witness (run 45328981265) observes a changed callback parameter spelling.
- Agent 9's cross-file ESM factory-return tests show identifier/string source changes in programmatic COO/SNO paths.
- This test adds actual multi-file SNO CLI coverage for a CommonJS require factory return, one-entry launcher, and helper integrity manifest.
- The test does not establish that arbitrary CJS module graphs, ESM helpers under a CJS entry, cycles, dynamic imports, or every Node loader configuration behave the same way.

## Source identity

At the final test commit, the production blobs for ast, properties, identifiers, strings, core, CLI, SNO and the SNO binary were independently compared with current main commit fb4dc52311dec569d0fda5f7b748304194353fbe and matched byte-for-byte. No production compiler source was changed.

## Additional repository repair

jsconfig.external.json contained a missing comma between the final existing test entries, which prevented strict JSON parsing. The repair adds the missing separator, removes the trailing comma at the end of the include array, and includes the new CLI witness in the external JSDoc project. The final two-platform workflow passes npm run typecheck:external.

## Limits and next work

- This is a semantic-compatibility observation, not a confidentiality or integrity guarantee. The SNO threat model grants the attacker access to the Node filesystem, runtime, and memory.
- The host override is a controlled Node preload, not a Chromium browser fixture.
- The application invokes the callback directly once; the host override does not invoke it. No host callback invocation frame is present.
- No runtime/compute benchmark was performed; no 2.5× claim follows.
- Next work should add the CommonJS factory-return case to the shared SourceObservationPlan acceptance matrix and test identifier and string consumers independently, while retaining positive yield for unrelated safe functions.
