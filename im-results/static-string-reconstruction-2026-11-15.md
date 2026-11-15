# Offline static recovery of prototype XOR string tables

Date: 2026-11-15  
Researcher: Agent 2  
Adversarial tool: `sims/static-string-recovery.js`  
Tests: `test/static-string-recovery.test.js`  
Validated: [manual research CI run 43677647105](https://github.com/FlareZ123/obfs/actions/runs/43677647105)

## Threat-model observation

In COO and SNO, an adversary can read the complete distributed source. The current `src/strings.js` encodes literals by XORing every JavaScript UTF-16 code unit with a fixed numeric key, storing encoded strings in a top-level array. It then emits a top-level `for` loop that uses `String.fromCharCode(raw.charCodeAt(j) ^ KEY)`.

The encoded array and the decoder's key are both present in the same distributed file. XOR inversion is therefore an AST-and-integer computation. A static observer can recover the literal strings without executing target code, accessing DevTools, or learning the original transformation seed.

## Reproduction and result

The adversarial tool parses the distributed file using Acorn, searches for an exact compiler-emitted top-level decoder shape, extracts the encoded string array and numeric XOR key from the AST, reverses XOR using UTF-16 code units, and replaces safely proven constant-index references to the decoder array with JSON-escaped literal strings.

It declines unfamiliar decoder structures or dynamic/unproven array uses and preserves the original decoder loop in the result, maintaining its existing side effects and execution order. Six executable tests passed on Node.js 22:

- ordinary long secret strings, reconstructed offline from generated output;
- repeated and deduplicated literals, reconstructed at each use;
- supplementary Unicode and isolated surrogate code units, preserved exactly;
- hashbang/directive prologues, preserved;
- unfamiliar code left byte-for-byte unchanged;
- dynamic table index conservatively left unchanged.

The tests compare the original, obfuscated, and statically reconstructed programs with a real JS runtime. For the supported shapes, each returned the same observable value, and plaintext literals appeared in the reconstructed program.

## Scope and limitations

This is a deliberately prototype-specific, pattern-based reconstruction. It does not establish the success rate of generalized static deobfuscation against arbitrary transformation changes, custom VMs, remote SCO secrets, unknown dynamic indices, runtime-protected keys, or adversarially altered helper layouts.

The result nevertheless provides a reproducible counterexample to **strong static confidentiality of the current string-table design** under the COO and SNO threat models: all information needed for decryption is in the distributed file.

A next-step defense should allocate security-sensitive operations to SCO server-resident code where possible and evaluate obfuscation against automated reconstruction on each candidate build. Hiding the XOR numeric literal with another locally reversible computation does not eliminate the local key-exposure limitation; it shifts the attack implementation.

The tool is a research instrument and is not part of the obfuscator's production pipeline. Findings remain at intermediate-evidence level.
