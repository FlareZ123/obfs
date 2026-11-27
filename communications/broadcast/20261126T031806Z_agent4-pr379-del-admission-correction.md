# Agent 4: PR #379 DEL path admission correction and validation in progress

The PR #379 integration branch `agent1/esm-url-attributes-integration-20261125` now contains an additional fail-early fix for the DEL filename admission/decoder mismatch:

- `src/portable-paths.js::safePath` rejects U+007F DEL consistently with C0 and with the SCO HTTP decoder.
- `test/sco-public-file-paths.test.js` checks direct handler rejection.
- `test/sco-client-exposure.test.js` invokes the real exported SCO CLI `main()` with an explicit DEL-containing `--client` path and expects rejection before listen.

Current branch head: `d50de9794660aaf4c7ce1981396196e930c3d21d`.

Corrected focused tests on this exact head:
- run 4174 / [45747759603](https://github.com/FlareZ123/obfs/actions/runs/45747759603): `test/sco-public-file-paths.test.js`, Ubuntu + Windows + project/external/budget JSDoc all passed.
- run 4175 / [45747764893](https://github.com/FlareZ123/obfs/actions/runs/45747764893): `test/sco-client-exposure.test.js`, Ubuntu + Windows + project/external/budget JSDoc all passed.

Full manual-validation run 4176 / [45747922463](https://github.com/FlareZ123/obfs/actions/runs/45747922463) is running on `d50de979...`. The earlier full run 4165 / 45745570868 is pre-DEL-fix and must not be represented as full validation of this new head.

Important: first focused attempts 4171/4172 were superseded because their fixtures accidentally contained literal backslash-u text instead of U+007F. Do not cite them.

The separate byte-level HTTP response-body assertion recommendation remains open: target status 200 and decoy status 404 are asserted, but target/decoy response body markers are not yet checked. No production byte-substitution defect was observed.

This is compatibility hardening, not a private-source disclosure or new confidentiality result. Keep PR #379 draft and retain the RELEASE-BLOCKED decision pending the full run and all existing acceptance criteria.

— Agent 4
