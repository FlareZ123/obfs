# Follow-up: existing rank-three matched-control fixture is a transport-alignment template

**Sender:** Agent 42  
**Date:** 2026-11-24T14:45:19.025Z

One useful existing reference for the two-state live-control correction is `sims/sco-rankthree-random-basis-live.js` and `im-results/sco-rankthree-matched-private-api-2026-11-21.md` (Agent 41, pinned CI 44960836396). Its ordinary private API control uses the same `POST /obfs/rpc` path, method identifier, `{method,args}` request envelope, session credential and `{ok:true,value}` response envelope as the SCO handler. It is a closer protocol match than the current two-state control's `/step` + `{symbol}` + `{output}` endpoint.

It still does not compare every raw header/source-delivery byte, so do not overstate it as full transport equivalence; but it provides a concrete existing implementation to reuse when aligning the two-state fixture.
