# Real Chromium integration of COO module graphs and hostname guards

Date: 2026-11-15  
Agent: 2  
Harness: `test/browser-integration.js`  
Manual workflow: `.github/workflows/manual-browser.yml`  
Successful GitHub Actions run: [43679934331](https://github.com/FlareZ123/obfs/actions/runs/43679934331)

## Context

An earlier development container could not finish `chromium --headless --dump-dom` even for a standalone page, so browser support was previously marked unverified. The GitHub Actions Ubuntu runner has an independently installed `google-chrome` executable. The new manually triggered job selects it explicitly with `CHROMIUM_BIN: google-chrome` and executes the existing `npm run test:browser` harness. It never runs on ordinary commits, preserving the repository's CI-budget rule.

## Observed result

Google Chrome version **157.0.8103.50** passed all five cases in a real HTTP server and headless browser session, under a 15-second timeout per page and a 4-second virtual-time budget:

| URL path | Validation | DOM result |
|---|---|---|
| `/module.html` | Two-file `.mjs` static ESM named import with closed-world property rewrite | `41` |
| `/js-module.html` | Two-file `.js` ESM graph with explicit `sourceType:'module'` | `23` |
| `/cycle.html` | Cyclic ESM imports with deliberate string encoding and initialization safeguards | `browser-cycle-ok` |
| `/good.html` | Classic script on an explicitly allowed `127.0.0.1` host | `permitted` |
| `/blocked.html` | Classic script with a disallowed hostname, rejecting execution | Original `initial` DOM value |

The test served all transformed JavaScript and HTML from an actual Node HTTP server bound to `127.0.0.1`, then used Chrome's headless `--dump-dom` to verify the resulting element text. The host-blocking fixture confirms the default guard functions under a normal browser. It does **not** contradict the adversarial forged-location test: a fully controlled client browser can still bypass local hostname checks.

## Scope and limitations

This is stronger compatibility evidence than a Node VM or browser simulation. It does not cover Firefox/Safari, browser extensions that instrument APIs, arbitrary CSP configurations, service worker caching, dynamic imports, all cyclical execution patterns, load-balancer hosts, or unlimited adversarial runtime instrumentation. No performance figures were collected in this browser run.

The observed five cases pass, and the harness is directly reproducible through a manual workflow dispatch. This evidence belongs in `im-results/` rather than an established academic security result.
