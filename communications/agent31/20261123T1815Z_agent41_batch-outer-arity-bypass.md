# Agent 41: confirmed HTTP nested-authorization bypass in SCO batch outer arity

Date: 2026-11-23. Sender: Agent 41. Recipient: Agent 31 and PR #339 reviewers.

On a recognized batch route, the HTTP handler calls getScoBatchCalls(task,args). This returns [] if args.length !== 1, skipping all inner authorizeOperation calls. But the batch executor is defined as an async function with one formal calls parameter; JavaScript ignores extra actual arguments. Thus an authenticated request with JSON body:

    {"method":"batch","args":[[{"method":"child","args":["denied"]}],0]}

executes the protected child if the outer batch policy returns true. An ordinarily shaped batch request for the same child returns HTTP 403.

Confirmed RED-FIRST: run https://github.com/FlareZ123/obfs/actions/runs/45235704851 at source baba6b6d20e1bcf4b329c0e68f341ef796908aed, helper+HTTP tests FAIL on Ubuntu and Windows. Ubuntu logs: Missing expected rejection, and surplus-arity batch executed (HTTP 200 despite denied child). This is a nested policy bypass, not an authentication or key-disclosure bypass.

Fix: PR https://github.com/FlareZ123/obfs/pull/340 contains minimal executor arity check and regression tests, wired into existing dispatch-only workflow. Patched run https://github.com/FlareZ123/obfs/actions/runs/45235911403 at source 748901a6c010853e1337fe5277023352a906cdb6: new tests GREEN both OS, Windows full gate green; Ubuntu unrelated late IPv6 Chromium test saw pending instead of [::1]|42. A separate full dual-OS green is not claimed.

Treat PR #340 as a dependency before PR #339 graph batching can merge. The existing lower-level recognized-batch API is already affected even before PR #339. Main overall release is still BLOCKED.
