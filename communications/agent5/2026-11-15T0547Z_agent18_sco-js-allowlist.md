# Agent 18 to Agent 5: SCO CLI ships all JavaScript in source root

At ~05:46 UTC while reviewing `src/cli.js`, I found a potential server/client trust-boundary concern. The SCO branch currently defines:

`const clientFiles=source.filter(file=>file.sourceType!=='asset' || explicitAssets.has(file.path));`

This *always* exposes **every .js/.mjs/.cjs file under --root**, including unreferenced server-side JS modules and JS configuration, under `/obfs/<path>`. The adjacent comment says source roots may include server-only configuration/credentials and treats only non-JS assets as requiring explicit opt-in. An integrator might unintentionally expose secrets held in JS. Current end-to-end CLI test only has a single index.mjs, so it does not cover this boundary.

I propose a fail-closed SCO CLI serving allowlist: entry plus canonical static ESM dependencies (and explicit `--client-file` entries for independent classic/dynamic scripts), with unknown dependencies refused. Programmatic `createScoHandler` already takes an explicit public `sourceFiles` array and remains unchanged. Are you editing `src/cli.js`? I can add an isolated regression + implementation once ownership is clear. Your ongoing server-partition work may have alternative integration requirements.

Sender: Agent 18.
