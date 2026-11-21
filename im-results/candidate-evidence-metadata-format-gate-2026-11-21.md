# Four-way candidate evidence metadata: reject truthy impostors and malformed SHA-256

**Agent 7, 21 November 2026.** This is a bounded evidence-integrity and reproducibility correction. It does not implement an obfuscation mechanism, authenticate untrusted reports, prove secrecy, or change the repository's **RELEASE-BLOCKED** strong-protection decision.

## Falsifiable regression

`sims/candidate-vs-minified-decision.js` previously admitted a source-identity flag and both attacker-attempt flags using JavaScript truthiness; it also read the protocol's `.length` without validating that the protocol was a string. SHA-256 evidence commitments were accepted whenever their strings had 64 characters, including strings not in hexadecimal notation. A caller submitting a malformed JSON-derived report could obtain a **supported attacker-cost advantage** for evidence whose same-application and attempted flags were actually the nonempty string `"false"`, or whose nominal digest contained invalid characters. This concerns a result classifier's input validation, not the integrity of any real measured obfuscator output.

The new test-only source commit [2944d688](https://github.com/FlareZ123/obfs/commit/2944d68866188cba9bc495baf86a3cfe30d5ca21) added two adversarial regression cases. The pre-fix [Ubuntu/Windows run 44962540007](https://github.com/FlareZ123/obfs/actions/runs/44962540007) failed **2 of 17 tests on each operating system** as predicted; the preceding 15 candidate-decision tests passed. The failures arose from exact assertions that malformed evidence must remain inconclusive.

The repaired classifier now requires exact Boolean `true` for application freeze and attempted-attack admission, actual Boolean clone-outcome values, and a nonempty string protocol identical between the two arms. A positive advantage additionally requires a canonical **64-character lowercase hexadecimal** SHA-256 shape for each of the three matched commitments. The existing positive synthetic fixture using three valid 64-hex commitments remains supported and the real source-only attack recovery remains contradicted as before.

A companion paired-source check in `sims/four-way-cross-runtime-verdict.js` now rejects a report pair with identical but malformed 64-character digest strings, instead of treating same-form invalid strings as established source parity. An adversarial regression asserts refusal of both nonhex and noncanonical uppercase values. All four source variants keep the original, valid SHA-256 comparison behavior.

## Source-pinned validation

- [Run 44962744586](https://github.com/FlareZ123/obfs/actions/runs/44962744586) at `57def335dff27b2c7a76fadd131d1f341b67df24`: successful Ubuntu/Windows Node 22, existing matched minifier and static attacker workflows, Ubuntu real Chromium, and strict external JSDoc after the candidate decision fix.
- [Run 44962837457](https://github.com/FlareZ123/obfs/actions/runs/44962837457) at **`f4dd7b9551145de57155c8843ea419d20748ed05`**: the same complete existing Ubuntu/Windows workflow passed after the cross-runtime digest format check was included. No new GitHub Actions workflow was introduced.
- An intermediate run at `195e3d0` validated the runtime test behavior but failed the strict type check because a new helper was placed between the caller's JSDoc comment and its function declaration; the subsequent `57def335` change corrected that declaration attachment. This type-check failure is preserved as an explicit intermediate failure, not classified as a successful gate.

The three comparison commitments are **format-validated declarations**. A 64-character hex string alone does not authenticate a source graph, an experimenter, held-out comparisons, or attacker methods. The joined Node/Chromium hashes are computed and cross-checked by the existing pinned workflow but the exported join function alone does not rehash absent source bytes.

## Decision and next action

This patch closes a narrow false-positive pathway in the research decision gate and preserves the existing control that source-only static recovery of the selected public polyvariant fixture contradicts any claim of demonstrated security superiority over an ordinary minifier. It does not resolve COO/SNO untrusted-runtime extraction, SCO online relaying, or any hard 2.5× runtime breach.

Future candidate claimants should publish actual source graphs, exact emitted content hashes, frozen attack protocols and independently checked output/host-callback traces. Treat structured evidence fields as untrusted until independently verified. Keep the current strong-obfuscation release blocked.
