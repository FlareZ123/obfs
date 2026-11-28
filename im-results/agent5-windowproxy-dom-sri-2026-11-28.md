# Agent 5 — browser WindowProxy and parser-inserted SRI (2026-11-28)

**Status:** browser-confirmed native/generated compatibility defect. A targeted, not-yet-integrated repair is on a research branch. Neither a global release pass nor an anti-reconstruction result.

## Mechanism

A declared ESM entry can import a locally obfuscated sibling and, without reading its file directly, insert a modulepreload link with the **original sibling SHA-256 SRI digest** into the active HTML parser. The sibling still returns the same primitive after private-property renaming, but its network response bytes change. The link changes from the browser's load event to its error event. This is a real 1:1 behavior violation.

The experimental source-island verifier accepted top, parent and opener browser WindowProxy globals, although they can reach an active same-origin Document. The separate default-mode source-byte observer missed WindowProxy roots and HTML inserted through insertAdjacentHTML.

## Reproducible source pins and CI

- Research branch: https://github.com/FlareZ123/obfs/tree/agent5/source-island-top-dom-sri-20261128
- **Static red:** commit a4ffbadabdb26cf823a2389ea4b433a4fcb8f1d3, two-platform CI https://github.com/FlareZ123/obfs/actions/runs/46120582023. Three forbidden WindowProxy-root paths were accepted (3/3 negative assertions failed on both platforms). Independent non-observed pure-leaf property rewrite remained positive in COO, SNO and SCO.
- **Real Chromium red:** commit 51006920f1485ca16665ec3bfa2da16e8b2cd81c, CI https://github.com/FlareZ123/obfs/actions/runs/46120731625. HTTP-served Chrome observations with correct MIME/no-store/nosniff: original **23:load**, tampered **23:error**, obfuscated **23:error**. Tampered bytes were changed by appending a comment, keeping functional output 23.
- **Default admission red:** commit 4533f8c339762d902854d4d925b83c666ffd395e, CI https://github.com/FlareZ123/obfs/actions/runs/46120889107. The non-opt-in group scanner also missed WindowProxy and direct Document HTML parser SRI, while the benign HTML positive control was retained.
- **First candidate repair:** commits 736d06f39d0601b7e5fad2dc6f27c898bdadd879 (island WindowProxy roots) and bf7f4cb45b0cecc3a31e99f03101c48d5c6e282a (group source observer: WindowProxy references, parser-active SRI markup). The name-only forbidden identifier proof was adjusted not to treat static member/property grammar tokens as ambient variables.
- **Top-level guarded browser green:** commit 7803818c353ba718fe59c5bdae91e867256016fc, CI https://github.com/FlareZ123/obfs/actions/runs/46120978507. Chromium native=23:load, tampered=23:error, guarded emitted=23:load, and the island was explicitly refused. New tests and existing source-island tests passed on Ubuntu and Windows.

That **overall** candidate workflow is still red at a later legacy function-reader test step. Independent unchanged-main CI https://github.com/FlareZ123/obfs/actions/runs/46121134132 failed at the same legacy step on both operating systems. Do not attribute that already-present failure to this patch or claim full-suite acceptance.

## Open adversarial checks

The initial repaired scanner may still miss a computed insertAdjacentHTML selector, a detached insertion method called via Function.call or Reflect.apply, and a computed innerHTML assignment. The **red-first hypotheses**, not established browser observations, are in test/agent5-html-integrity-dynamic-dom.test.js and the multi-scenario sims/agent5-source-island-windowproxy-sri-browser.js. Evaluate each against native, byte-tampered and obfuscated HTTP-served graphs before expanding the proof.

The new independent CI job also runs strict project and external JSDoc checks; source-pinned results must be cited separately from those of the legacy failing job.

## Research scope

This is primarily **semantic/source-byte preservation**, not evidence of anti-debugging, protected secrets, 2.5x end-to-end CPU compliance, or reconstruction resistance. The experimental island feature is opt-in, while the default group scanner is a separate general-purpose conservative admission test. The present repository remains RELEASE-BLOCKED. Public SRI hashes are verifiers, not secret material.

To reproduce with Node 22, install dependencies and run the two named test files, then invoke the browser simulator with CHROMIUM_BIN pointing at Chrome and the --expect-guarded flag. See its source-pinned GitHub Actions runs for the exact browser and OS versions.
