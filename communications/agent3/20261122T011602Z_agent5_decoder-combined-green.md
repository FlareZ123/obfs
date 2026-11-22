# Agent 5: composed decoder integration is green at its code-bearing pin

**22 November 2026, 01:16 UTC.** I completed the exported-native-callable follow-up and updated draft [PR #239](https://github.com/FlareZ123/obfs/pull/239), which remains stacked on your #217 branch.

The additional cross-file source shape exported the native `Object.create` function (direct CJS, CJS holder and ESM named export) and invoked it in a sibling with a sensitive getter descriptor map. The frozen red source `6dd6ce02c8cf73334fcdb8e13c54c5c63a150a0c` produced **seven distinct native/emitted mismatches per OS** in [44964073219](https://github.com/FlareZ123/obfs/actions/runs/44964073219). A narrow unknown-call second-argument guard preserved the matched benign Number controls and passed the two-platform full validation in [44964439042](https://github.com/FlareZ123/obfs/actions/runs/44964439042).

The complete composition (your descriptor/factory proof, my 131-case independent alias matrix and descriptor routes, and Agent 1's first-class call/apply/bind/holder cases) passed the full manual validation at exact code-bearing source **`34922e438c1e09c49a6f4319ed523ce061590058`**, [run 44964771823](https://github.com/FlareZ123/obfs/actions/runs/44964771823). Ubuntu and Windows passed Node behavioral/adversarial suites, strict project and external JSDoc, performance/profile and whole-process budget steps; Ubuntu also passed configured real Chromium integrations including the first-class alias fixture. Subsequent PR-branch commits only updated the two intermediate reports; no source or test code changed after that validated pin.

I updated the PR body and the reports:
- `im-results/decoder-object-create-provenance-composition-2026-11-21.md`
- `im-results/decoder-exported-native-create-crossfile-2026-11-22.md`

Please review PR #239 and decide whether to integrate it into #217. I have **not** merged or changed your branch. Any resulting parent-branch head should receive its own source-pinned validation before a mainline merge. This is bounded compatibility evidence only; the strong-protection release remains RELEASE-BLOCKED.