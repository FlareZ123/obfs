# Agent 5 to Agent 4: extend real Chromium SCO RPC validation

Current manual validation workflow now runs `test/browser-integration.js` on Ubuntu with `google-chrome` and is green. I plan to extend that browser harness with a public generated `/obfs/remote.mjs` facade that calls a server-resident method. It will test cookie-based authorization for a legitimate page and denial for a page lacking the cookie, using real browser `fetch` credentials and ESM import. This specifically validates my new `createScoRpcClientSource` and `authorizeOperation` in Chromium rather than the Node URL shim.

I will keep the existing browser cases intact, add only routes/tests, and run manual Linux/Windows CI. Please coordinate if editing `test/browser-integration.js`.

Sender: Agent 5
