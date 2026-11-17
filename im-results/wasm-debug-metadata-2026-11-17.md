# WebAssembly debugging sections disclose original symbol metadata

**Author:** Agent 25. **Date:** 17 November 2026. **Status:** intermediate reproducible defensive source-disclosure case, pending pinned GitHub Actions validation. The protected artifact still requires independent attacker-cost and 2.5x session evidence.

## Evidence and threat boundary

Wasm's normative **\`name\` custom section** may contain printable original module/function/local names for debuggers. Wasm debugging conventions additionally use embedded **\`.debug_*\` (DWARF)** sections or an **\`external_debug_info\`** reference to an external debug payload, and compressed sections commonly use \`.zdebug_*\`. The [WebAssembly 3.0 name-section specification](https://webassembly.github.io/spec/core/appendix/custom) and [WebAssembly tool-conventions debugging specification](https://github.com/WebAssembly/tool-conventions/blob/main/Debugging.md) define these paths. Custom sections do not participate in Wasm execution semantics.

A public \`.wasm\` file distributed as an opaque asset could previously retain those sections verbatim. A source-only attacker can call \`WebAssembly.Module.customSections(module,'name')\` or scan the binary to recover private symbol spelling from the emitted bytes. The pre-existing guard only recognized a custom section named \`sourceMappingURL\` and thus permitted the \`name\` and DWARF conventions. This does **not** by itself prove full original JavaScript source disclosure; the demonstrated leak is exact private function names (and, for DWARF, often source-file paths and debugging metadata).

## Protected implementation

\`src/wasm-debug-metadata.js\` walks the Wasm binary's section boundaries using validated u32 LEB128 lengths, reading **custom section names** rather than arbitrary payload text. It identifies \`name\`, \`external_debug_info\`, \`.debug_*\` and \`.zdebug_*\`. The shared \`src/source-maps.js\` preflight rejects recognized debug sections in COO/SNO static assets and in assets explicitly published by SCO. Existing WebAssembly compile validation and sourceMappingURL refusal remain enforced; the new helper additionally recognizes binary-compatible string-backed assets by parsing their eventual UTF-8 output bytes.

The guard intentionally refuses potentially legitimate debug-bearing assets. Integrators can strip debug sections before the obfuscation/build step, retaining their stripped Wasm execution semantics, rather than silently altering binary files in the obfuscator.

## Reproducibility

- \`test/wasm-debug-metadata-disclosure.test.js\`: valid Wasm with a \`name\` section containing \`OriginalPrivateFunctionCanary_672381\`, each mode's refusal and SCO handler refusal, DWARF and external debug-name variants, harmless custom-section payload containing debug-like text (negative control), string-backed Wasm, malformed section boundaries. Existing \`test/wasm-source-map-annotation.test.js\` now includes string-backed SourceMappingURL.
- \`sims/wasm-debug-metadata-attack.js\`: pinned previous/protected comparison. A genuine executable Wasm module returns 42 with or without the debugging section. A separate JS program is actually transformed and compared to its native VM result. The previous compiler publishes the instrumented Wasm, whose \`name\` section reveals the exact original private function spelling. The protected compiler refuses publication in COO/SNO/SCO. Real localhost SCO HTTP fetch is covered.
- Existing manual cross-platform workflows \`.github/workflows/manual-transform-safety.yml\` and \`.github/workflows/manual-asset-attack.yml\` now include these tests and the paired attacker. Node 22.16 local standalone validation passed 18 name, debug, safe-payload, string-backed and malformed-boundary cases. No integrated compiler or cross-platform success is claimed before exact-SHA CI completes.

## Security and compatibility assessment

| Dimension | Established scope |
| --- | --- |
| Static extraction | The controlled exact function-name recovery from public Wasm debug metadata is reproducible by binary inspection. Recognized debug section names now cause build/serve refusal |
| Runtime instrumentation | Unchanged. Attackers still inspect any distributed Wasm/JS and can instrument authorized execution |
| Integrity and environment locking | Unchanged. No server-root authorization is created for full-control COO or SNO |
| 2.5x compute budget | No new emitted client/server code in accepted Wasm/JS hot paths. Build-time preflight adds binary parsing. Universal full-session budget not established |
| Compatibility | Wasm with recognized debug sections now fails explicit preflight; ordinary custom sections and unchanged Wasm program behavior remain accepted |

Arbitrary custom sections can also contain private source or symbols, but exhaustive source-absence detection is not possible with this bounded section-name policy. The demo does not claim to reconstruct original JS from a \`name\` section. The baseline's exact publication leak is independent of other compiler obfuscation gains. Keep the work intermediate, with severe residual runtime and format-coverage limitations.
