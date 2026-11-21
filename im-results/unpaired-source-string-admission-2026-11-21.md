# Non-well-formed UTF-16 JavaScript source strings change on UTF-8 publication

## Reproduced parity hazard

The direct `obfuscateFiles` API accepts JavaScript source as a JS string; a host can construct a raw isolated surrogate code unit without spelling it as a backslash escape in its source. Node 22 accepts it in a generated function source, but UTF-8 encoding through `Buffer.from(source, 'utf8')` or `fs.writeFile` replaces the isolated surrogate with U+FFFD. A source that returns U+D800 before writing can therefore return U+FFFD after publication even if the obfuscator preserves the raw source text without transforming it.

A local Node 22.16.0 reproduction (standard runtime, no repository dependency) evaluated a source string containing U+D800 and observed U+D800 before UTF-8 publication and U+FFFD after Buffer encoding/decoding. This is an exact-byte/Unicode emission problem, not a property-provenance or security-strength result.

## Conservative bounded repair

- `src/core.js` checks each direct string JavaScript source after determining `sourceType`, refusing unpaired surrogate code units using Unicode-aware `/[\uD800-\uDFFF]/u`. Genuine astral surrogate pairs are treated as one code point and remain valid.
- `src/sco.js` applies the same preflight to direct `createScoHandler` publication, which bypasses the whole-group `obfuscateFiles` normalization.
- `test/unpaired-source-input.test.js` reproduces the original mismatch, verifies all three modes refuse the malformed raw source, verifies direct SCO admission refusal, and preserves the semantics of explicitly escaped surrogate literals and valid astral Unicode source strings as positive controls.
- Programmatic `sourceType:'asset'` input remains outside the JavaScript-source preflight. Callers requiring exact binary asset bytes should supply Buffers. The CLI's file-backed source pathway has separate strict UTF-8 byte validation in `im-results/utf8-source-admission-2026-11-21.md`.

This is deliberate **fail-closed input contract narrowing**: a caller previously able to pass a raw isolated UTF-16 surrogate in `code` must spell it as a JavaScript escape if it intends to publish a runtime string with that code unit. The new test evaluates real original/emitted runtime values instead of asserting literal output equality.

## Validation and limits

Implementation and regression commits `df2066daac34d350f0d94abedaa4bdcfd781dfd8`, `c031678f52f197d9e79d5965f057ed575906fdfa`, and final positive-control source `3efb472b87284125ea97a3eb1b873d63fdaf76eb`. Full independent Node 22 Linux/Windows + Ubuntu Chromium validation is **not yet complete** for this exact source; the separate canonical-path preflight candidate is running at [44937910645](https://github.com/FlareZ123/obfs/actions/runs/44937910645).

No source secrecy, hostile-runtime resistance, universal URL locking, or protected-runtime 2.5× compute conclusion follows. These checks occur before protected code runs and may refuse more inputs than a permissive compiler.
