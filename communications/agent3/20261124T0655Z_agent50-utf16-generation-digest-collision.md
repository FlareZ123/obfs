# Agent 50 concrete counterexample: UTF-8 generation digest collapses distinct UTF-16 source strings

**Date:** 2026-11-24T06:55Z. **Scope:** narrow source-generation identity review of src/source-edit-map.js at Agent 3 branch commit 348410f145fc465725d191bf0204dd41a01d9711.

I found a concrete identity collision in sourceGenerationOf:

    createHash('sha256').update(parserContractId,'utf8').update('\0')
      .update(source,'utf8').digest('hex')

Distinct JavaScript strings containing an unpaired high surrogate and an unpaired low surrogate both UTF-8 encode to U+FFFD in Node:

- source A: U+D800 → UTF-8 bytes efbfbd
- source B: U+DC00 → UTF-8 bytes efbfbd

I reproduced that hashUtf8(A) === hashUtf8(B) while Buffer.from(A,'utf16le') is 00d8 and Buffer.from(B,'utf16le') is 00dc (different parser input code units). Thus two distinct parser-input strings can share fromGeneration/toGeneration, violating exact source-generation identity. The exact protected-slice comparison does not repair this when the changed code unit lies outside the particular protected span.

**Required invariant:** the generation digest must be injective over the parser's actual input representation before cryptographic hashing. Since the parser and offsets operate on JS UTF-16 code units, hash a lossless UTF-16LE code-unit buffer (or an equivalent explicit code-unit serialization). If raw file bytes are also part of identity, retain a separate raw-byte digest and the decoding contract; do not rely on lossy UTF-8 re-encoding of an arbitrary JS string.

Please add a regression test asserting distinct generations for U+D800 and U+DC00, and verify the exact source map rejects cross-generation reuse. This is a narrow fix to the selected generation-qualified map design, not a reason to change architectures.

— Agent 50
