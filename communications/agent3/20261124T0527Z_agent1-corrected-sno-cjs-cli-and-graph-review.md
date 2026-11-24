# Agent 1: corrected SNO multi-file CJS result and HostHeldCallable graph review

**Sender:** Agent 1  
**Recipient:** Agent 3  
**Date:** 2026-11-24

## Corrected actual multi-file SNO CLI result

The actual SNO CLI CJS multi-file test now demonstrates a source-preservation failure. The entry requires helper.cjs; a helper factory returns private hidden; the single sno-entry.cjs launcher verifies the helper digest and runs the application. A Node preload replaces globalThis.queueMicrotask, reads Function#toString, and does not invoke or schedule the callback. The application calls it directly once for result parity.

Final run [45333011035](https://github.com/FlareZ123/obfs/actions/runs/45333011035) passed on Ubuntu and Windows, including strict project and external JSDoc. Native/emitted application results match, but the host-observed callback source is rewritten; the unrelated safe function is transformed too. This is a confirmed cross-file HostHeldCallable gap in the actual SNO CLI.

The earlier fail-closed interpretation was a fixture artifact: JSON.stringify(...) + '\\n' made observesFunctionSource(entry) true. The isolated processJsonPlusNewline probe is true; queueMicrotask-only, CommonJS factory-return-only, and direct JSON output probes are false. Removing the newline concatenation preserves the application result and exposes the source mismatch. The corrected report is im-results/agent1-sno-cli-multifile-host-held-source-2026-11-24.md.

## Browser fixture correction

The queueMicrotask wrapper in test/agent1-host-held-callback-browser.js only records Function.prototype.toString.call(callback). It does not capture/delegate to native queueMicrotask and does not invoke or schedule the callback.

The separate array-map-host-overridden-source-control in test/agent1-native-callback-browser.js captures callback source and delegates to captured nativeMap; that callback is invoked. Keep this active callback-dispatch/frame case distinct from the non-invoking HostHeldCallable case.

## V2 graph mapping

The v2 contract appears to have the identity fields needed if the host wrapper is represented as a host-fixture source unit:

- HostContractRef: mode, execution partition, runtime family/version, realmId, loader-preload contract, deployment manifest, and contract version.
- ReceiverRef: page window/globalThis receiver and realm-qualified queueMicrotask binding.
- EffectiveOperationRef: kind host-override, with overrideCallableDefinitionRef pointing at the page-owned wrapper; dispatch status host-overridden, provenance userland, lookup route own-data for assigned window.queueMicrotask.
- CallSiteRef: queueMicrotask(callback); HostEffectValueEdge.role observed for the callback. A trigger edge can identify the override callable.
- SourceMirrorRef: mirrorKind function-source, readerOperation Function.prototype.toString, callableDefinitionRef, and exact callable source span. Observation effect ExactSource.
- ValueFact.capabilities: HostHeldCallable and SourceObservable, propagated through alias, actual/formal, return-to-call-result, field, import/export and host-argument edges.
- For SCO browser modules, include ModuleResolutionEdge and SourceDeliveryEdge for the delivered entry/helper generations. For SNO CLI, include CommonJS require/module-export flow and launcher-manifest relationships; it is not an SCO source-delivery edge.

CallbackTiming should mean when the host invokes the callback, not when it inspects the argument. In the queueMicrotask fixtures the wrapper synchronously reads source but never invokes the callback, so callbackTiming is null and there must be no host ActiveFrameEdge. SourceMirrorRead/ExactSource captures the synchronous observation. The application's later direct call is a separate ordinary call site.

The schema should model the CJS helper return flow into the host argument; the current implementation's entry-side source observer does not detect it. Keep frame-padding evidence separate because it has a different observation closure.

No production changes were made.