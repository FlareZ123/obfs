# Threat-model and proof boundaries

## Static and dynamic analysis

XOR string encoding, locally proven identifier renaming, and seeded names raise the cost of casual inspection. They are trivially reversible by an adversary who can run JavaScript, observe the decoder, inspect memory, or instrument property access. A measured time slowdown says nothing about deobfuscation resistance.

## Property-name transformation

The implementation only edits properties of literal objects whose relevant local uses are proved by a deliberately narrow static analysis. Objects with dynamic keys, unknown consumers, escaping references (including const exported aliases), ambiguous bindings, unsupported syntax, visible-scope mismatches, nonprimitive writes, or reflection are excluded. `--closed-world` permits direct ES module export/import use only when the deployment's module set is genuinely complete and all consumers are rewritten together. It is unsafe to enable the option for a library with unknown consumers. This proof should be fuzzed further before production use. The analysis permits explicitly declared CSS, raster-image, and font assets to accompany an ESM graph only under an integrator guarantee that each is served with a non-JavaScript MIME type and never interpreted as source. File extensions alone are insufficient evidence of safe execution. HTML, SVG, unknown assets, and other executable JavaScript formats force the cross-file pass to decline renaming.

## Authorization

COO: The receiver can modify script and `location` observations. Host lock is bypassable, and ESM static imports/reexports must be rejected because dependencies evaluate before the body guard. True authorization must live on a trusted server.

SCO: The obfuscation-controlled server can keep undistributed secrets and enforce authenticated operations. Requests for JavaScript can be replayed, and unlimited responses can be collected. Per-response mutation alone does not ensure secrecy. The SCO CLI now restricts the public file set to entry-reachable ESM modules plus explicit `--client` JavaScript and `--asset` data files. Files elsewhere in `--root` are withheld, including server-only JavaScript modules. Runtime `import()` edges are deliberately excluded from automatic publication, including literal specifiers: unreachable branches must not accidentally publish server-only modules. Non-module scripts, workers and runtime-loaded files likewise require deliberate `--client` declarations. Importing a privileged module from the client entry will expose that module by design. Programmatic `createScoHandler` requires the integrator to pass only public source files. Any `Host`/`Origin` check is an auxiliary signal, not identity authentication. The optional authenticated RPC service retains method implementation on the server, but black-box oracle attacks and timing overhead remain in scope. Operational controls such as rate limits, monitoring, and durable authentication belong to the integrator.

SNO: Under the stated attacker model the adversary owns code, filesystem, and process memory. A hash manifest inside a launcher cannot prevent code modification or bypass. For integrity, deploy a remote trust anchor or OS/TEE-backed attestation beyond this project's capabilities.

## Performance

The CLI emits executable JavaScript using normal JS operations. String decoding incurs startup cost (especially in COO). Hot-loop string sites are excluded, but the 2.5x runtime requirement is empirical and workload-specific. `test/benchmark.js` samples arithmetic, property read/write, and string comparisons; it fails if any observed median exceeds 2.5x. This does not exhaust possible programs or timing distributions.

## Compatibility

Acorn parses standard stage-4 JavaScript, CommonJS and ESM. JSX, experimental syntax, non-JavaScript languages, unrecognized bundler conventions, native add-on binary changes, code that depends on function-toString source, and unmodeled reflection require other handling. Module specifiers and file paths are preserved. The output writing API uses cross-process lock files with atomic rename within the same filesystem. Paths reject traversal, Windows device names, unsafe Windows filename characters, and case-insensitive collisions. The multi-file directory is not a transactional snapshot.
