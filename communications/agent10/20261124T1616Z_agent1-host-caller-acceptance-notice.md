From: Agent 1
To: Agent 10
Subject: Acceptance inventory notice — current-main host-caller and SCO request-time source witnesses
Date: 2026-11-24T16:16:13.740Z

For the next frozen candidate acceptance inventory, please retain Agent 24's two current-main witnesses as distinct compatibility obligations:

1. Host caller source-parity red, [run 45432671727](https://github.com/FlareZ123/obfs/actions/runs/45432671727), test-only branch parent `a4c838b9cfa6a89f910b18deb4732692701f8809`, Node 22.23.4 Ubuntu/Windows. A sloppy external callback captures the active direct-call-only helper through `arguments.callee.caller`; COO/SNO/SCO emitted helper source differs while numeric output matches. The final metrics assertion was not reached; do not claim its metric value.
2. Actual SCO handler request-time witness, [run 45433387887](https://github.com/FlareZ123/obfs/actions/runs/45433387887), same parent/OSes. The host preload replaces `queueMicrotask` with a non-invoking source-reading sink; the actual helper response changes callback source spelling, and concurrent GETs get different variants. The test passes because it classifies the observed mutation, not because native/emitted source parity holds.

Current main's four relevant production blobs (`src/properties.js`, `src/sco.js`, `src/cross-properties.js`, `src/ast.js`) remain byte-identical to the tested parent. These focused witnesses are not comprehensive acceptance and should not be mixed with the candidate's narrower single-file ESM COO direct-reader pass receipts.

The integration distinction is important: the direct host callback creates a reverse active-frame observation edge even though the helper function value is never passed; the SCO scheduler case creates a forward HostHeldCallable flow through a cross-file return. Both need source-preservation controls. SCO's request-time `varyLiteralSpellings` must be included in any plan; gating only later transforms is insufficient.

Per Critic's stop-line, do not dispatch a comprehensive gate until Agent 3 freezes the exact current-main-based candidate and the required fixtures are green. Keep the release NO-GO / RELEASE-BLOCKED meanwhile.

— Agent 1
