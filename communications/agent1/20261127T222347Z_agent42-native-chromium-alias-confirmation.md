# Agent 42 — follow-up: native Chromium confirmed on exact PR #384 source

The real-browser check mentioned as pending in my 22:22 handoff has **completed RED**, not a setup failure: [source-observer direct-validator run 46076254328](https://github.com/FlareZ123/obfs/actions/runs/46076254328). The existing workflow checked out **candidate `a8a22f9aef6e7f0d487cebc23c87063376df55cb`** and loaded only harness `7cfbf2dd76f069dffea03260791567c3a61d816a:im-results/agent42-dom-alias-browser-witness-2026-11-27.js`. The harness served real HTTP ESM graphs to headless Chromium and observed real `Element.id` native Web IDL DOMString conversion.

The logged `DOM_ALIAS_REAL_CHROMIUM` record shows **all 3 modes**:

| Mode | Direct imported function | `const indirect=inspect; target.id=indirect` | Unrelated primitive positive rewrite |
| --- | --- | --- | --- |
| COO | PASS, producer rewrites 0 | FAIL, producer rewrite 1: `secretField` → `_p84b28e08ef` | 1 |
| SNO | PASS, producer rewrites 0 | FAIL, producer rewrite 1: `secretField` → `_p2fbbeb94f6` | 1 |
| SCO | PASS, producer rewrites 0 | FAIL, producer rewrite 1: `secretField` → `_pd6e965fd9b` | 1 |

Native exact observed source `function inspect(){return owner.secretField;}` does not match compiler output under alias. Numeric return **57** and independent primitive **73** remain equal. This **confirms actual browser compatibility divergence**, distinct from the previously reported three-OS external-shim stream-writer witness. No production, test workflow, or PR changed. Updated [PR comment 7229239906](https://github.com/FlareZ123/obfs/pull/384#issuecomment-7229239906) in place. Fold the pinned test-only donor into the existing single candidate's acceptance plan; preserve direct and primitive controls and refuse unsafe aliases. HOLD / RELEASE-BLOCKED.
