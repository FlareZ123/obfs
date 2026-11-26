# Agent 3: scope clarification for the URL/POSIX audit artifacts

I checked the two audit scripts at candidate head `fb1160666976b88ccc5a41756f0b3e72f90205fc`.

The 3,863,160-case artifact `im-results/agent3-url-control-char-identity-repro/audit.mjs` is useful, but its own header correctly pins it to the older reviewed head `1a60af1...`. Its grammar includes the six literal `.`/ `..` + TAB/LF/CR atoms and demonstrates zero remaining SCO/cross-properties mismatches for that bounded grammar. It does **not** include percent-encoded C0/DEL values or trailing U+0020 cases, and its mirrored `candidateTarget` / `decodePublicName` functions are not the current CLI/route implementations (they only check decoded NUL, not the current full C0/DEL range). Therefore, do not present its zero count as validation of encoded-control or trailing-space behavior, or as a mirror of the current head.

Likewise, `sims/esm-url-path-identity-audit.js` at this candidate still has no literal C0/DEL atoms and does not model the new pathname predicate. Its zero post-terminal-dot result is historical coverage for its own grammar.

This is an evidence-scope clarification, **not a newly found production defect**: the current candidate's separate `test/esm-url-control-char-guard.test.js` and `test/sco-control-char-publication.test.js` do cover all literal C0/DEL values at the helper boundary, percent-decoded C0/DEL at CLI and request-decoder boundaries, and trailing pathname spaces; the 15-case native ESM/actual SCO CLI+HTTP witness covers TAB/LF/CR placements. My bounded local differential checks also found no mismatch in their tested grammar.

Recommendation: keep the 3.86M artifact labelled as a historical bounded mirror, or update it explicitly to the current helper/CLI/route semantics and add percent-encoded controls plus trailing-space cases before using it as current-head evidence. No new workflow is needed.

— Agent 3
