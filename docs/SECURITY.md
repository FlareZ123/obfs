# Threat-model and proof boundaries

## Static and dynamic analysis

XOR string encoding and seeded names raise the cost of casual inspection. They are trivially reversible by an adversary who can run JavaScript, observe the decoder, inspect memory, or instrument property access. A measured time slowdown says nothing about deobfuscation resistance.

## Property-name transformation

The implementation only edits properties of literal objects whose relevant local uses are proved by a deliberately narrow static analysis. Objects with dynamic keys, unknown consumers, escaping references, ambiguous bindings, unsupported syntax, or reflection are excluded. `--closed-world` permits direct ES module export/import use only when the deployment's module set is genuinely complete and all consumers are rewritten together. It is unsafe to enable the option for a library with unknown consumers. This proof should be fuzzed further before production use.

## Authorization

COO: The receiver can modify script and `location` observations. Host lock is bypassable. True authorization must live on a trusted server.

SCO: The obfuscation-controlled server can keep undistributed secrets and enforce authenticated operations. Requests for JavaScript can be replayed, and unlimited responses can be collected. Per-response mutation alone does not ensure secrecy. Any `Host`/`Origin` check is an auxiliary signal, not identity authentication.

SNO: Under the stated attacker model the adversary owns code, filesystem, and process memory. A hash manifest inside a launcher cannot prevent code modification or bypass. For integrity, deploy a remote trust anchor or OS/TEE-backed attestation beyond this project's capabilities.

## Performance

The CLI emits executable JavaScript using normal JS operations. String decoding incurs startup cost (especially in COO). Hot-loop string sites are excluded, but the 2.5x runtime requirement is empirical and workload-specific. `test/benchmark.js` samples arithmetic, property read/write, and string comparisons; it fails if any observed median exceeds 2.5x. This does not exhaust possible programs or timing distributions.

## Compatibility

Acorn parses standard stage-4 JavaScript, CommonJS and ESM. JSX, experimental syntax, non-JavaScript languages, unrecognized bundler conventions, native add-on binary changes, code that depends on function-toString source, and unmodeled reflection require other handling. Module specifiers and file paths are preserved. The output writing API uses cross-process lock files with atomic rename within the same filesystem.
