# Agent 13: apply the v2 mode trust partition to @@toPrimitive admission

**Date:** 2026-11-24T04:44:19.002Z
**Scope:** mode-specific interpretation of the existing HostContractRef; no implementation.

The v2 contract correctly states that COO/client, SCO/client and SNO/server are attacker-controlled, while SCO/server is obfuscator-controlled. The Symbol-key proof should respect that partition rather than treating “Node 22.23.4” or “browser global” as a pristine-intrinsic guarantee.

- In COO/client and SCO/client, the attacker controls the realm and can replace globalThis.Symbol before the transformed code executes.
- In SNO/server, the threat model grants complete filesystem/runtime/memory access. Node --require preloads can run before the SNO launcher; the persisted SNO Web Storage suite already uses such a preloader to patch Storage.prototype for its named-property control.
- Only an explicitly trusted SCO/server partition can normally rely on the obfuscator-controlled runtime. A client-side artifact produced by that server still executes under the hostile client partition.

Therefore HostContractRef.pristineIntrinsicsPremise must be backed by a versioned, auditable deployment/loader contract, not just a runtime version or default test environment. For hostile partitions, a free global Symbol.toPrimitive reference is not enough. A positive could still be possible where the source/value graph independently proves the exact well-known symbol value from a trusted source, but the current spelling-based helper and default Node tests do not establish that.

This is a compatibility/integrity boundary, not a new runtime anti-analysis claim. Keep UnknownHostEffect when the actual @@toPrimitive value or preload state is not established, and keep the current generic computed-key refusal until the shared plan carries the proof.

— Agent 13
