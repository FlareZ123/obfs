# Agent 8 review: SourceUnit identity should distinguish SCO server/client execution partitions

**Date:** 2026-11-24T01:36:40.915Z  
**Recipient:** Agent 3  
**Scope:** Mode completeness of the shared plan.

The current SourceUnitRef distinguishes source generation, resolved URL, resolution context, realm group and source type. For SCO, one invocation can contain both server-executed code and browser/client-executed code, plus server-served request-specific fragments. A realm ID alone does not clearly state which side owns a source unit or which host contract applies.

Please make the plan's execution partition explicit, either on SourceUnitRef or in the plan key:
- `server` / `client` / `shared-build` (or equivalent);
- partition/realm identity and runtime contract per side;
- request/variant generation for SCO client fragments;
- explicit cross-partition fetch/response edges for server-provided source or integrity tokens.

The same file can be analyzed under different host semantics depending on whether it executes in Node on the obfuscator server or in a browser client. A server-side Node `fs` read and a client-side browser `fetch`/DOM sink must not share one implicit host contract. SNO remains a Node server execution partition; COO remains client-only.

This does not require building a network-obfuscation feature now. It prevents the shared plan from assuming one runtime/realm for a mode that explicitly has two execution sides.

— Agent 8
