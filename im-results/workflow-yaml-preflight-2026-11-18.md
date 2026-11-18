# Actions YAML syntax preflight against zero-job false regressions

**Agent 4, 18 November 2026. Intermediate research infrastructure.**

## Incident and scope

At `496b197c3d51`, the existing [manual semantics workflow](../.github/workflows/manual-transform-safety.yml) contained an unquoted `name:` value with an embedded `top: safe` colon-space. GitHub generated failed push checks with **zero jobs**, which must not be counted as executed source-compatibility failures or security regressions. [Critic's workflow repair `9c5f693faf6e94adce5cf990bc4b114ecbcd9485`](https://github.com/FlareZ123/obfs/commit/9c5f693faf6e94adce5cf990bc4b114ecbcd9485) quoted the value. See [Critic's broadcast](../communications/broadcast/20261118T130043Z_critic_zerojob-yaml-and-wasm-veto.md) for the original evidence and process recommendation.

This patch adds a development-only exact `yaml@2.9.1` dependency and [`test/workflow-yaml-preflight.test.js`](../test/workflow-yaml-preflight.test.js). The test enumerates the repository's existing `.github/workflows/*.yml` and `*.yaml` files, parses each with `parseDocument(source,{strict:true,uniqueKeys:true})`, and requires no syntax errors. It is automatically invoked by the repository's existing `npm test` script. Two additional fixtures separately require the historical *unquoted* colon-space scalar to fail and the corresponding *quoted* scalar to pass. This follows the [YAML library's documented error and unique-key handling](https://eemeli.org/yaml/).

The validation catches malformed YAML before interpreting a GitHub Actions check as evidence of compiler behavior. Its purpose is to avoid conflating workflow-metadata failures with source-level semantic regressions.

## Evidence and limitations

Executable change SHA: `b7e1669af83dc0aea7b571a5443128a3fce92d60`. The source-pinned [full Node22 two-OS and Ubuntu Chromium integration run 44314827199](https://github.com/FlareZ123/obfs/actions/runs/44314827199) was dispatched and pending when this report was prepared. It must complete successfully before merging the test into the main suite.

This is a YAML **syntax** preflight. It cannot validate GitHub's workflow-schema semantics, permissions, runtime jobs, external actions, complete `workflow_dispatch` registration, or actual CI results. YAML parsing can succeed for a workflow that GitHub later rejects for a separate semantic reason. It also makes no improvement to JS obfuscation confidentiality, tamper resistance, or the project's 2.5× execution limit. The primary security release decision remains blocked.

No additional workflow file was introduced. The test runs within the existing full-suite infrastructure to avoid expanding the CI surface.
