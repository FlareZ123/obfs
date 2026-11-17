# Lossy UTF-8 filename aliases at the COO/SNO/SCO output boundary

**Date:** 17 November 2026. **Classification:** bounded engineering safety finding and regression, pending fresh whole-repository validation. This protects output namespace consistency against one independently demonstrated alias family. It does not establish deobfuscation hardness, tamper resistance in a hostile runtime, or successful hostname locking.

## The defect and actual witness

The shared `src/core.js::safePath` previously checked directory traversal, Windows reserved names and forbidden punctuation, but did not require well-formed Unicode filenames. A JavaScript file path containing a lone high or low UTF-16 surrogate differs as a string from a literal Unicode replacement character `U+FFFD`. Node's UTF-8 path conversion can nevertheless encode both spellings to the same byte sequence. Therefore source groups that use different JavaScript names can alias the same output file when materialized.

On local **Node 22.16.0 Linux**, `Buffer.from('module\\uD800.js','utf8')` and `Buffer.from('module\\uFFFD.js','utf8')` were identical. A temporary-directory filesystem witness found one physical output file for those distinct names; writing through either name could change the same data. The independent `test/utf8-path-alias.test.js` carries a byte-exact witness and a POSIX filesystem test using exclusive `wx` creation, which refuses the second path as `EEXIST` instead of deliberately overwriting data. The latter real-filesystem test was added after the first CI pin and must receive a separate green check.

Node's official [Node 22 filesystem path documentation](https://nodejs.org/download/release/latest-jod/docs/api/fs.html) states that string paths are UTF-8 sequences; actual behavior is established by the test, rather than assumed from a nominal Unicode specification.

## Compiler preflight repair

`safePath` now rejects `/[\\uD800-\\uDFFF]/u` matches before any file output. With the Unicode regex flag, the range matches unpaired surrogates while a well-formed surrogate pair representing an astral symbol remains valid. Caller-provided well-formed names including a rocket emoji or the literal `U+FFFD` remain accepted.

The shared function is used by programmatic COO/SNO/SCO `obfuscateFiles`, by the SCO HTTP publication handler, and by the SNO launcher, so the regression exercises all three routes. For deliberately malformed names, the new observable behavior is a constructor-time `TypeError` instead of an output path potentially colliding with another path. The correction is a deliberate stricter input contract.

Commits:
- [Guard](https://github.com/FlareZ123/obfs/commit/efaf8746e19cbbdf84da000ad1ae2784fd1cc5df)
- [Cross-mode regression](https://github.com/FlareZ123/obfs/commit/a67e66126232582122f4430df194b63ffec2b07a)
- [Real POSIX exclusive-create witness](https://github.com/FlareZ123/obfs/commit/9da95d31d4e338ffcc161480b88efc26b49c0756)
- [Manual two-platform regression step](https://github.com/FlareZ123/obfs/commit/3b7dc389a828cb2bc6b3d8433a846b23d5d1f5f2)

## Exact pinned validation

[Manual Linux and Windows Node 22 run 44062076875](https://github.com/FlareZ123/obfs/actions/runs/44062076875) at exact SHA `3b7dc389a828cb2bc6b3d8433a846b23d5d1f5f2`: **cross-mode UTF-8 path regression success on both OS jobs**, as verified from the individual step conclusions. Primary JSDoc and other transformation semantics steps also passed. **Overall workflow FAILED** at unrelated `npm run typecheck:external` due typed-return diagnostics in concurrent `sims/sco-private-windows-alias-probe.js` and `test/sco-selected-handler.test.js`. Do not report the full workflow as green. The later actual-filesystem test and Unicode alias grid are outside that pin.

A second manually dispatched workflow at exact SHA `aa720208ef5d88526abe09ac2233a003417d17cd` ([run 44063019063](https://github.com/FlareZ123/obfs/actions/runs/44063019063)) includes `sims/path-alias-grid.js` probing actual exclusive-create equivalence vs JavaScript lowercasing. Its results are not yet established in this initial report.

## Threat and performance limits

This addresses filesystem output integrity and compiler semantic behavior under a *trusted* output environment. It does not prevent malicious modification by a COO/SNO runtime owner, SCO authorized online relaying, or a compromised obfuscator server. Normal well-formed paths execute the same emitted JavaScript; the validation is build-time. There is no new target runtime code, but this alone cannot establish the project's universal 2.5× bound.

Other filesystem alias families remain possible: native case-insensitive comparison tables, Unicode normalization, device paths, symlinks, hard links and platform-specific pathname behavior. One concurrent [native Windows SCO private-source alias probe](https://github.com/FlareZ123/obfs/blob/main/sims/sco-private-windows-alias-probe.js) examines case-equivalence candidates. Agent 47 independently added `sims/path-alias-grid.js` and coordinated with Agent 35 before asserting any further Windows collision. Positive claims about NTFS must rely on actual Windows runner results, not heuristics derived from Unicode case conversion.
