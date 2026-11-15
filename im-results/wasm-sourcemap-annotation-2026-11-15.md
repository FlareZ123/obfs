# WebAssembly sourceMappingURL custom-section disclosure preflight

Date: 2026-11-15. Author: Agent 15. Classification: intermediate build-time safety regression, not general source confidentiality.

## Mechanism

[ECMA-426 §7.1.2.3](https://tc39.es/ecma426/2024/) specifies that WebAssembly can link to a source map through a custom section named `sourceMappingURL`. [WebAssembly tool-conventions](https://github.com/WebAssembly/tool-conventions/blob/main/Debugging.md) documents the custom-section payload as an unsigned size prefix followed by URL bytes. The URL may identify a map with original source in `sourcesContent`, including a data URL. Before the change, the repository copied binary `.wasm` and disguised `.bin` assets without inspecting this standardized source-map channel.

## Compiler correction

`hasWasmSourceMapDirective` in `src/source-maps.js` detects the `\0asm` binary magic in any Buffer-valued opaque asset, then uses the runtime's `WebAssembly.Module` validator and `WebAssembly.Module.customSections(module,'sourceMappingURL')` interface to inspect the actual section table. This avoids false positives from ordinary data bytes containing a `sourceMappingURL` string. The preflight denies any matching custom section and fails closed on malformed/unsupported modules with Wasm magic; normal non-Wasm binary assets are unchanged. The data is inspected at build/publication time, so protected code runtime overhead is unchanged. On current Node JSDoc typings, the compiler copies the Buffer into a directly owned `Uint8Array` before passing it to WebAssembly's constructor, avoiding the `ArrayBufferLike`/shared-buffer type ambiguity.

New `test/wasm-source-map-annotation.test.js` constructs a complete valid minimal WebAssembly binary with a `sourceMappingURL` custom section whose payload includes a base64 JSON map with an original-source canary. It verifies actual runtime custom-section extraction, refusal in COO/SCO/SNO with `.wasm`, `.bin` or `.DAT` asset names, SCO handler construction, and acceptance and byte-identical preservation of a valid WebAssembly custom section containing only an ordinary metadata string. It also checks fail-closed behavior for an invalid WebAssembly section and no misclassification for arbitrary binary data.

This addresses one standardized source-map reference path. A program can still publish original source in arbitrary Wasm data or debug sections. Other custom sections can reveal source names, and compile-time validation can refuse a future-version module unsupported by the current Node engine. The safe source-map detector is therefore intentionally a conservative publication gate. It does not make a Wasm binary resistant to disassembly or dynamic instrumentation.

Validation: A first cross-platform run [43714272990](https://github.com/FlareZ123/obfs/actions/runs/43714272990) failed JSDoc typecheck only because the WebAssembly constructor expected an owned ArrayBuffer-backed view, while Node's Buffer was typed with `ArrayBufferLike`. The implementation was corrected in commit `0838ea49d750e5e16e4f031190a90f8b1cfd94fb`, and exact-head focused CI was rerun. Final acceptance requires the rerun to pass.
