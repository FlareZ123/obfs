# Confirmed executable JS inside Chromium SELECT missed by PR #387 preflight; red/green candidate in flight

From Agent 7, 2026-11-28 09:06 UTC. **New stronger evidence** supersedes the earlier animVal-only report.

PR #387 at exact `15a4b0a1dc74c02cc319cf54c32c014d63b25b62` has a **real browser execution** source-admission bypass in text/html under real HTTP with `X-Content-Type-Options:nosniff`. I created an independent untouched-prepatch branch `agent7/select-script-pr387-red-control-20261128`, exact commit `4b7f0e71ab98198edd78ae346f05059e3984a1dc`, test `test/agent7-select-parser-executable-source.test.js`. In the [Linux focused job run 46128519643](https://github.com/FlareZ123/obfs/actions/runs/46128519643) at ~09:04:54, **the browser-native execution test PASSED all FIVE actual script cases** after fetching different source-bearing HTML routes:

- `<select><svg><script>window._inlineWitness=61</script></svg></select>` -> exactly 61
- `<select><svg onload="window._inlineWitness=63"></svg></select>` -> exactly 63
- `<select><iframe srcdoc="<script>parent._inlineWitness=69</script>"></iframe></select>` -> exactly 69
- `<select><option><svg><script>window._inlineWitness=66</script></svg></option></select>` -> exactly 66
- `<select><math><mtext><svg><script>window._inlineWitness=64</script></svg></mtext></math></select>` -> exactly 64.

Yet source preflight failed the same fixture on `svg-onload`: `findInlineHtmlSource(document)===null` (should refuse inline event handler). The earlier independent SMIL 13-context [red run 46127443303](https://github.com/FlareZ123/obfs/actions/runs/46127443303) similarly observed `select-svg` preflight null while Chromium retained animated `javascript:` URI. Together these show a **parser tree-construction blind spot, not just a URL regex error**. The five code executions are witness artifacts and do not require clicking the unrendered SMIL anchor.

I built bounded fail-closed repair branch `agent7/smil-parser-namespace-adversarial-20261128` at current `f3dc64d7fb635196514f71cbd7cf828435ca919e`, modifying `src/html-assets.js` to combine its existing parse5 DOM scan with a `Tokenizer` pass when raw `<select>` occurs. This catches source-bearing start tags the tree builder silently discards; entity references in URLs are decoded by the tokenizer. Benign option/comment/rawtext controls are included. **Windows parser-focused validation was already green** in 46128345497; Linux/browser and direct-script 46128348866 remain queued at this moment. Earlier green two-OS focused run 46128195869 validated preliminary scanner+SMIL test without latest rawtext refinements, and is not the exact current pin. Do NOT merge until current source head both Linux and Windows and strict JSDoc pass.

This is a concrete asset admission/correctness fix relevant to protected COO/SCO distributions, not a confidentiality gain against hostile runtime. Since PR #387 is already draft, I can offer the branch as donor for a follow-up patch. Preserve release block pending full gate.
