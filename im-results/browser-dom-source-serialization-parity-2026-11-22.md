# Four positive-yield browser DOM source-serialization parity failures

**Date:** 22 November 2026. **Classification:** Intermediate, source-pinned compatibility counterexamples. **Affected version:** current COO identifier obfuscation, specifically programmatic `obfuscateFiles` with `sourceType:'script'`; no overall security claim.

## Reproduction and source pin

- Test program: [`sims/browser-dom-source-serialization-pair.js`](../sims/browser-dom-source-serialization-pair.js).
- Evaluated branch: `agent34/dom-serialization-red-first-20261122`, commit `8108a865134631d824320779b94d374c99f63c5a`. The branch adds only a focused Ubuntu Chromium invocation to the existing two-platform `manual-cross-readers.yml`.
- GitHub [run 45025990481](https://github.com/FlareZ123/obfs/actions/runs/45025990481), Ubuntu job `137219017964`, stage `Browser DOM serialization source-observer native/emitted parity`. Chromium actually executed three variants for each fixture using `--headless --dump-dom` on temporary `file:` HTML documents. The stage **failed intentionally** after logging all four variants of the mismatch.
- Earlier first-case [run 45025809987](https://github.com/FlareZ123/obfs/actions/runs/45025809987) at `b71f3d6edefb21b5055d056901a2885acd645dc4` independently confirmed the `document.documentElement.outerHTML` mismatch, but stopped after the first failing assertion.
- The initial [run 45025590020](https://github.com/FlareZ123/obfs/actions/runs/45025590020) at `bb3eed96653941a560b5b2b27cfac5f9db7228d5` had a **vacuous green** because a top-level classic-script `const` was not renamed; it must not be counted as positive transformation coverage. This mistake was corrected with a function-local variable and a separate positive control before the red-run evidence was recorded.

The fixture emits a **function-local** numeric binding `const privateNumber=input+5`, reads the currently embedded executable JavaScript through one of four DOM routes, and computes `sourceMatch=observed.includes("private"+"Number")`. The split constant ensures the source text's match comes from the variable's exact spelling rather than the lookup string itself. The negative control manually renames `privateNumber` to `q`. Every variant calls the same numeric computation. The compiler run sets `mode:'coo'`, `strings:false`, `identifiers:true`, a case-specific deterministic seed, and no host lock.

An otherwise identical **inert** executable script with no source observer is a positive transformation control: compiler reports **2 renamed bindings** and changed source, so the source-observing cases have an independently established eligible rewrite path.

## Real Chromium observations (all four, same source pin)

| Embedded read | Original value / sourceMatch | Manually renamed control | Actual compiler emitted | Emitted rewrites |
| --- | --- | --- | --- | ---: |
| `document.documentElement.outerHTML` | 8 / true | 8 / false | 8 / **false** | 2 |
| `document.body.innerHTML` | 8 / true | 8 / false | 8 / **false** | 2 |
| `document.querySelector("html").innerHTML` | 8 / true | 8 / false | 8 / **false** | 2 |
| `document.getElementById("script-probe").textContent` | 8 / true | 8 / false | 8 / **false** | 2 |

All observations were read directly from the Ubuntu job log and all four failed a genuine original-versus-compiler behavior assertion. The secondary manually-renamed control identifies the semantic dependence on source spelling; it is not the source of the compiler result. The output numeric value alone is insufficient to establish semantic equivalence.

## Why the compiler admitted the rewrite

At the evaluated mainline `src/ast.js` blob `fded5c8451a07dc5c249a7decdbf4eaa445eea03`, the `observesDistributedSource` function had no literal handling of `document`, `currentScript`, `documentElement`, `getElementById`, or `querySelector`. That syntactic observation is consistent with the observed two renamed bindings. The older abandoned Agent 34 DOM source guard [PR #56](https://github.com/FlareZ123/obfs/pull/56) was not merged and described these four routes as beyond its scope. Real Chromium proves the selected document-element/serialization paths can expose own embedded executable bytes.

Other DOM reads can preserve normal positive renaming yield, for example a benign `document.title`; a global veto on all `document` references would sacrifice valid rewrites. Covering these four direct routes does not establish proof for aliases, borrowed DOM methods, cross-frame traversal, DOM mutation timing, cross-module source access, or delegated callbacks. A sound broader contract needs explicit conservative treatment of unproved source-bearing DOM object graphs.

## Threat, compatibility and performance limitations

These are **four finite semantic mismatches**, not proof of generalized property analysis unsoundness or of an attacker resisting reverse engineering. Source reflection by the executing classic script is part of its observable program behavior. The measured 8/true versus 8/false difference makes byte-preserving transformation or explicit refusal necessary for this input under the 1:1 parity objective.

No strict 2.5× performance conclusion is drawn: the test only checked functional equivalence and rewrite count. The COO attacker already controls client-side execution and public source; this red does not establish additional hostile-environment protection. There is no reason to change the repository's **RELEASE-BLOCKED** decision.

## Integration ownership

The established canonical source-observation integration owner is Agent 3. A direct [four-case evidence handoff](../communications/agent3/20261122T1311Z_agent34_four-dom-source-observer-parity-red.md) requests these as red-first tests for the existing source-observer suite while preserving a benign DOM positive-yield control. The historically stale browser DOM [PR #56 handoff](../communications/agent3/20261122T1301Z_agent34_dom-inline-source-pr56-handoff.md) was archived unmerged; importing its patch wholesale into current main is not supported by a current cross-pass integration pin.
