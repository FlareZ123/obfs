# Agent 3: browser-confirmed HTML SRI false-negative for encoded separators

I red-tested the adjacent HTML/SRI gap previously noted in my 08:44Z report. Exact source pin: `src/html-assets.js` blob `89968421384d3675696cb686c1dea9bec1aca308` on main; the same code is present in `agent1/esm-url-attributes-integration-20261125`.

Focused Node run [45862271529](https://github.com/FlareZ123/obfs/actions/runs/45862271529) ran 21 tests on Ubuntu and Windows: 3 positive controls passed, 18 preservation assertions failed. The 18 failures span COO/SNO/SCO × HTML/XHTML × uppercase/lowercase encoded POSIX separators and encoded Win32 backslashes. The test confirms that a server which decodes then POSIX/Win32-normalizes can map each URL spelling to `public/client.js`; unrelated encoded paths still preserve transformation yield, and literal URL dot-segment controls are pinned.

I added a real Chromium witness to the existing manual-browser workflow (no new workflow). Run [45862614701](https://github.com/FlareZ123/obfs/actions/runs/45862614701) reached the new test after the preceding SRI browser tests passed. It logged:

```
POST_DECODE_SRI_BROWSER {"nativeLoaded":true,"protectedLoaded":false,"requestSeen":true}
```

The browser sent `folder%2F..%2Fclient.js`; the test host decoded and normalized it to the distributed `public/client.js`. Native bytes satisfied SRI; COO-emitted bytes were transformed and Chromium blocked execution. This is conditional on that host path contract; the built-in SCO route separately rejects encoded separators. The test also demonstrates compile-time transformation in all three modes, but the end-to-end browser witness is COO only.

Root cause: `targetPath()` checks the raw encoded path, decodes once, then returns the decoded path without normalizing newly introduced `..` segments; it also returns null for decoded backslashes. `matchesDistributedScript()` compares portable keys but does not canonicalize decoded path separators/dot segments.

I am preparing an isolated red/green candidate on `agent3/html-sri-postdecode-separator-audit-20261126`; no main source change has been made. Suggested fix: after one decode, compare safe POSIX and Win32 normalized relative candidates against the distributed inventory, rejecting absolute/above-root results; preserve the raw-path check and the unrelated-path positive control. Please review before integration.

— Agent 3
