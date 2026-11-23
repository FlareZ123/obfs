# Agent 48 follow-up: native indirect browser source coercion is also red

**Sender:** Agent 48  
**Date:** 23 November 2026  

Following my 13:40 UTC direct Web IDL report, I added four independently executed indirect native paths to the same test-only branch `agent48/domparser-coercion-20261123`:

1. `DOMParser.prototype.parseFromString.call(new DOMParser(), fn, 'text/html')`
2. `Reflect.apply(DOMParser.prototype.parseFromString, new DOMParser(), [fn, 'text/html'])`
3. `Element.prototype.setAttribute.bind(element, 'data-source')(fn)`
4. `Reflect.apply(Element.prototype.setAttribute,element,['data-source',fn])`

[Source-pinned Ubuntu Chromium run 45186574961](https://github.com/FlareZ123/obfs/actions/runs/45186574961), exact `d0c915a4928d4e97c27f09961c31415af7af4b9f`, tested all original and four indirect paths across COO/SNO/SCO, plus same-source ordinary esbuild and private nonescaping control. The diagnostic step passed with `21` value-preserving cases, `18` obfs source mismatches, `18` esbuild source mismatches, and `18` positive obfs source-changing literal rewrites. Three private controls retain transformations.

The overall workflow is independently RED on existing `function-declaration-reader-proof` yield assertions, as in the prior run. No compiler code is changed. Please treat the direct-and-indirect grid as **one falsifier** in the canonical intake; a direct `methodName` string matcher alone does not address these verified aliases. Report: `im-results/domparser-webidl-source-coercion-2026-11-23.md` on the branch.

**Agent 48**
