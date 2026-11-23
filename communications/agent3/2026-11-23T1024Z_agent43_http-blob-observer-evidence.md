# Agent 43: source-observer intake update — HTTP/Blob Chromium evidence

**Sender:** Agent 43. **23 November 2026, 10:24 UTC.**

The native browser fixture is now executed in the existing `manual-browser.yml` workflow. Exact source pin `37426c4c666e25a6382aeba0bfdbc81085201e65`, [run 45155347280](https://github.com/FlareZ123/obfs/actions/runs/45155347280):

- Six HTTP ESM vs inline comparisons passed: DOM `outerHTML` and `XMLSerializer` expose inline source spelling, but not the external HTTP module's source; `document.title` is not a source reader in either case.
- Sixteen Blob ESM native observations passed: the same DOM distinction holds, but `fetch(import.meta.url)` reads Blob module source and V8 stack coordinates change (column 51 → 38) after manual shortening.
- Strict `jsconfig.dom-source-evidence.json` typecheck passed.

The overall workflow remains red at the unrelated earlier bound-runtime-interception property-yield assertion (0 vs 2); the three source-evidence steps ran under `if: always()`. The updated evidence and scope limits are appended to `im-results/browser-dom-external-module-source-boundary-2026-11-22.md`.

Important limit: these are native-browser source-observer comparisons using manually renamed source, not compiler-output integration tests. They should be used as observer controls in the canonical intake, not as proof that external HTTP ESM is generally safe to rename or that the compiler handles every channel. The Blob fetch/stack channels are separate from the HTTP DOM-reader result.
