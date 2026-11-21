# Portable source-tree identity: ancestor alias admission

**21 November 2026 | Agent 5 | engineering and compiler-correctness evidence.**

## Bounded claim

The existing COO/SNO/SCO source inventories checked exact, case-folded and
NFC-normalized *full leaf paths*. They did not verify the identity of each
intermediate directory. A Linux-valid input inventory could therefore name
distinct leaves under directory spellings that alias on common
case-insensitive or normalization-insensitive filesystems, or use an existing
file path as the parent of another file.

This is a portability and output-admission error class. The patch refuses the
ambiguous tree before compilation or manifest generation. It does not
establish confidentiality, anti-tampering, environment authorization, or
runtime cost improvements.

## Source-paired regression

The frozen seven-case test is
[`test/portable-path-tree.test.js`](../test/portable-path-tree.test.js).
The original baseline branch is
[`agent5/portable-path-baseline-20261121`](https://github.com/FlareZ123/obfs/tree/agent5/portable-path-baseline-20261121),
source `ab8efed138fb1bef443bf3c6a0fdc77ed29281f6`.
The patched branch is
[`agent5/portable-path-tree-20261121`](https://github.com/FlareZ123/obfs/tree/agent5/portable-path-tree-20261121),
source `60dbb3fb90a1c2aac942f6c9f25cfdeb891ea40e`.
Both freeze the same test content and Node 22.23.4 runner version.
The original accepts the five negative input classes or declines for an
unrelated reason, while preserving the two positive controls:

| Test family | Original Ubuntu/Windows | Patched Ubuntu/Windows |
| --- | --- | --- |
| Case-aliased ancestor directory | FAIL / FAIL | PASS / PASS |
| NFC-aliased ancestor directory | FAIL / FAIL | PASS / PASS |
| File used as parent directory | FAIL / FAIL | PASS / PASS |
| NFC-aliased SNO package-scope directory | FAIL / FAIL | PASS / PASS |
| SCO publicPaths ancestor collision | FAIL / FAIL | PASS / PASS |
| Two distinct sibling files | PASS / PASS | PASS / PASS |
| Existing full-leaf alias refusal | PASS / PASS | PASS / PASS |

The pre-fix run
[44942617437](https://github.com/FlareZ123/obfs/actions/runs/44942617437)
reported **2 passed / 5 failed** on each OS.
The patched targeted run
[44942614013](https://github.com/FlareZ123/obfs/actions/runs/44942614013)
passed on both operating systems including strict JSDoc and related
existing file-path/Node package-scope regressions.

This is an executable before/after witness, not a proof of full equivalence
on arbitrary programs. The complete integration workflow is separately
dispatched, and conclusions about its result require its exact run/sha.

## Implementation

A new shared `src/portable-paths.js` inventory records two namespaces:
canonical leaf files and canonical ancestor directories. Canonicalization
uses `String.prototype.normalize('NFC').toLowerCase()`, matching the
repository's existing conservative full-file policy. A newly encountered
ancestor refuses if its canonical spelling was already registered under a
different literal form. A leaf conflicts with an ancestor in either input
order. The compiler `obfuscateFiles`, direct `createSnoLauncher`, and direct
`createScoHandler` each apply this check to their own declared output set;
SCO explicit `publicPaths` is validated too.

Cost is additional compiler/handler construction-time path scanning, not a
new emitted-runtime operation. No measured universal 2.5x runtime claim is
made. The policy is deliberately conservative: it refuses distinct paths on
a case-sensitive Linux filesystem if they could alias on an insensitive
deployment filesystem. NFC + JavaScript lowercase is **not** a complete
model of every Unicode folding or filesystem equivalence relation.

## Reproduction and next investigations

On Node.js 22, run `node --test test/portable-path-tree.test.js` against
the two SHA-pinned branches; run `npm run typecheck` on the patched branch.
Compare the independent before/after CI links above. An actual APFS/macOS
filesystem and stress cases involving unusual Unicode equivalence remain
unmeasured. Symlink and reparse-point rejection is a separate source-tree
policy. This result should remain in `im-results/`, without promotion to
academically established code-protection claims.
