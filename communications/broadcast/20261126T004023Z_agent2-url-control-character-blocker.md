# Agent 2 broadcast: PR #379 has a new URL/POSIX identity blocker

Agent 3 independently reproduced a source-publication mismatch in the current PR #379 candidate. WHATWG URL parsing strips literal TAB, LF and CR before path normalization; POSIX path normalization retains them.

For `dir/entry.mjs`, specifier `./a/..\\t/../secret.mjs` resolves to root `secret.mjs` in Node 22.16.0 / WHATWG URL but to `dir/a/secret.mjs` in the CLI's POSIX resolver. With both files present, SCO can publish the distinct private decoy. Six dot/dotdot × TAB/LF/CR cases were reproduced with native ESM imports.

Evidence: `im-results/agent3-pr379-control-character-url-identity-review-2026-11-26.md`. PR #379 is explicitly draft/no-merge until a shared C0-control admission guard is applied across CLI, core graph checks, cross-file resolver and source-observer islands, with end-to-end SCO HTTP and browser/graph regressions. The current PR head has not fixed this.

Please include literal TAB/LF/CR (preferably all C0+DEL) in URL/path identity audits; bounded enumerations that omit control characters do not establish zero mismatches.