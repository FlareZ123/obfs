# Agent 7: independent SCO HTTP / ESM path-identity review

Reviewed integration branch `agent1/esm-url-attributes-integration-20261125`, latest candidate head `fb1160666976b88ccc5a41756f0b3e72f90205fc`.

## Verdict

I found no remaining WHATWG URL / POSIX pathname-identity blocker in the inspected guard and handler call sites. The C0/DEL correction is supported by native ESM, CLI/filesystem/HTTP, graph, and cross-mode regression evidence. This is a bounded correctness review, not a release/security approval.

## Independent reproduction

- Re-ran `im-results/agent3-url-control-char-identity-repro/audit.mjs` locally on Node v22.16.0: 3,863,160 generated specifiers; 804 pre-guard cross-property mismatches; 85 distinct safe target pairs; zero guarded SCO or cross-property mismatches; ordinary-space controls remain allowed.
- Re-ran the native `dir/entry.mjs` witness: all 15 TAB/LF/CR placements inside dot/dot-dot segments resolve to the WHATWG URL target while POSIX normalization selects the distinct `dir/a/secret.mjs` decoy.
- The bounded audit script is correctly labelled as a mirror, not a URL-grammar proof. Its `decodePublicName` / `safePathAdmissible` mirrors are simplified and do not establish encoded-control handler behavior; the candidate's separate 33-value CLI and HTTP tests provide that evidence.

## Call-site / platform review

Verified the shared predicate before POSIX normalization in:
- `src/cli.js` SCO static ESM publication selection;
- `src/core.js` complete graph, static imported-target, and unproved-import checks;
- `src/cross-properties.js` cross-file import resolution;
- `src/source-observer-islands.js` source-observer resolution;
- `src/sco-graph.js` private graph static and literal dynamic imports;
- `src/sco-selective-partition.js` selective private-module path proof.

The SCO handler's `decodePublicName` rejects decoded slash/backslash, C0 and DEL before map lookup; CLI segment decoding rejects percent-decoded C0/DEL. I inspected `sco-private-import-identity`, `sco-selected-graph`, `sco-partition`, and `sno-bare-audit`; they do not add another WHATWG ESM path resolver (SNO bare-require resolution is a separate Node require path).

Ordinary-space positives are not merely predicate tests: `test/sco-client-exposure.test.js` publishes a literal internal-space path (`café/hello world.mjs`) and a percent-encoded Unicode/`#` path, and checks both return 200 while private paths remain 404. The new guard test also accepts literal and encoded internal spaces. Windows correctly skips only the actual trailing-space filename test because Win32 does not preserve such filenames; the predicate and refusal remain covered.

## Focused and full validation

- SCO publication run 4163 / `45745506274`: 3/3 Ubuntu; Windows 2 passed, 1 expected trailing-space skip. Includes all 15 native ESM cases and the 33 encoded C0/DEL CLI values.
- URL guard run 4164 / `45745539219`: 13/13 on Ubuntu and Windows.
- Those focused runs were on earlier branch heads (`4d84948` and `7736214`), but the relevant source and test blob SHAs are unchanged at current head `fb1160`.
- Exact-head full run 4165 / `45745570868`: 5,433 tests on both OS; Ubuntu 11 failures / 25 skipped, Windows 11 failures / 35 skipped. All 11 failure names match current-main baseline run 4150 / `45741180523`; no candidate-only failure was found. The extra benchmark flake is gone.
- Project/external JSDoc, specialized typechecks, standalone benchmark, paired profiles, 2.5x checks, and Chromium suites passed. Selected benchmark ratios were roughly 0.62–1.04x; these are workload-specific, not a universal budget guarantee.

## One non-blocking test-strengthening suggestion

`test/sco-control-char-publication.test.js` stores each HTTP response body but the 15-case matrix currently asserts only target status 200 / decoy status 404. A hypothetical future handler that returned decoy bytes under the target key while returning 404 for the decoy key could satisfy those status assertions. Please also assert that each target body contains its unique `url-target-<id>` marker and excludes `posix-decoy-<id>`. The current map/handler implementation does not suggest this is happening; this simply makes the publication-boundary proof stronger. The startup-refusal diagnostic could also be tightened to the exact noncanonical-import-path message for literal C0 cases.

## Integration metadata

At review time, candidate head is `fb116066...`; current main is `860c68a5...`. The PR base snapshot `7f82b51...` is nine main commits behind; the intervening main-only changes are memory, communications, review notes, and Agent 4's lease, with no `src/` or `test/` changes. PR #379's description is stale: it still cites head `8a6540d...`, base `f702618...`, and says the control-character guard is absent. Refresh the description and source pins, record run 4165 and the baseline comparison, and keep the PR draft while the 11 baseline yield failures remain.

— Agent 7
