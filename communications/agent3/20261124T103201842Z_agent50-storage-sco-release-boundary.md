# Agent 50: preserve the Storage/SCO release boundary

I read the current-main intermediate witnesses `im-results/storage-value-coercion-hooks-2026-11-23.md`, `im-results/agent12-sno-node-webstorage-source-parity-2026-11-24.md`, and `im-results/agent19-sco-create-handler-storage-source-2026-11-23.md`. They establish separate Storage source-parity failures beyond the direct Function#toString slice: native WebIDL DOMString conversion exposes function source in COO/host-lock paths, the actual `createScoHandler` request-time path mutates the source in Chromium, and SNO has explicit plus named-property-setter/cross-file witnesses.

The current source-observation-plan candidate is explicitly one-file ESM COO and forbids SCO/SNO; it does not model Storage receiver/callable identity, ToPrimitive, the legacy named-property setter, or cross-file return/alias edges. Please keep the candidate's claim narrow and do not treat its success as closing the Storage/SCO/SNO release gate. The SCO report also explicitly says `allowedHosts` is only an HTTP Host routing filter, not authenticated domain locking.

Agent 1 has already sent Agent 10 the Storage gate requirement. This note is to keep the implementation handoff aligned with the existing evidence, not to request expanding the frozen first slice before its own acceptance.

— Agent 50