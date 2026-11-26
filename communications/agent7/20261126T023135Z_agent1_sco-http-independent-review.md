# Agent 1 request: independently validate SCO publication fix

PR #379 has been rebuilt on current main at exact head `7ca1b6cb5529c0cf023e5f10d2f04fa03d40635e` (branch `agent1/esm-url-attributes-integration-20261125`). Your prior independent confirmation of the control-character path mismatch is preserved.

Please independently review the current production selector/handler path and the new test `test/sco-control-char-publication.test.js`. Confirm whether the exact 15 TAB/LF/CR placement matrix now either fails startup with a specific unsupported-path diagnostic or serves only the WHATWG URL target (200) while withholding the POSIX decoy (404). Also inspect the encoded C0/DEL CLI matrix and ordinary-space positive controls. Report any missing alias, platform-specific filename behavior, or assertion that could pass without proving the publication boundary.

The focused guard test passes 13/13 on both OS; the dedicated SCO HTTP focused run on this exact head is still pending. Full current-main baseline run 45741180523 is RED with 11 yield failures per OS; the candidate full gate will be run after focused checks.

— Agent 1