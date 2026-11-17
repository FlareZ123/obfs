# Asset-publication trust contract beyond finite encoded-source heuristics

Author: Agent 25, 17 November 2026. Status: architectural proposal, unimplemented and not an established academic result.

## An unavoidable information-flow assumption

The project accepts sources together with opaque assets and preserves accepted asset bytes so consuming programs retain behavior. Every byte of a publicly distributed asset is necessarily visible to an attacker. Scanners for map suffixes, source-map JSON, UTF-16 encodings, executable HTML/SVG, nested CSS data imports, and Wasm debug metadata prevent concrete accidental leaks. They cannot prove the stronger proposition that arbitrary opaque bytes contain no private source.

A caller could place an invertibly encoded copy of an original JS module in an innocuous JSON property, custom Wasm section, or font metadata field. An attacker who obtains the public bytes can reverse that representation. Adding a blacklist for one encoding leaves unlimited alternatives. A defensible confidentiality guarantee must instead rely on reviewed disclosure approval or a trusted provenance proof for every public asset, plus a threat assumption about outside dependencies. This concerns COO, SNO and especially SCO, where a private source could otherwise escape through an unrelated public static response.

## Proposed implementation contract

1. Preserve permissive opaque asset publication for backward compatibility, explicitly describing it as publishing caller-controlled bytes. Retain bounded source-disclosure guards as useful accident prevention, with static attacker reproductions and benign byte-preservation controls.
2. Experiment with an opt-in strict public-artifact manifest. For each output path record its reviewed input SHA-256, declared MIME, disposition (transform, approved-public-opaque, generated-after-obfuscation), and review provenance. Refuse absent, ambiguous, duplicate or stale declarations. A hash binds reviewed bytes and does not prove their secrecy.
3. Bind SCO responses to the same output path, content type and hash manifest. Validate URL percent decoding, path identity, Unicode normalization, redirects, and every file the server can actually send. Treat externally hosted dependencies as separate unverified boundaries.
4. For COO and SNO, verify the final shipped directory after all transformation, packaging and compression. Check that every distributed file has an approval record. A hostile client or server owner can still modify files, so no anti-tamper root is created by a public manifest.
5. State source confidentiality as conditional on approval of a complete source-free public asset set. Avoid converting the finite number of scanned extensions into a claim that all arbitrary encodings have been excluded.

## Falsifiable experiment for integrators

Freeze one representative three-module app with HTML, CSS, SVG, Wasm, images and external resources. Construct an approved manifest and a second candidate containing an unrecognized reversible encoding of original source inside a normal-looking asset. Existing permissive rules may accept the encoded source and a source-only attacker should decode it. Strict mode must refuse the second asset solely because its exact bytes are not approved. It must continue to preserve the approved application's outputs and byte-identical safe public files across Windows, Linux and a real browser. Add a negative control where a reviewer intentionally approves source-bearing content; the manifest cannot make a malicious review safe.

Pair build and serve timings with complete original/transformed application sessions and baseline conventional minification. Manifest validation should add no emitted hot-path instructions, but no universal 2.5x budget follows from this expectation.

## Relevant evidence and decision

Intermediate reports: im-results/asset-source-disclosure-2026-11-15.md, im-results/css-data-import-disclosure-2026-11-17.md, im-results/wasm-debug-metadata-2026-11-17.md and im-results/utf16-source-map-binary-disclosure-2026-11-17.md. Current docs/SECURITY.md already acknowledges bounded scanning. The mainline sims/release-evidence-gate.js remains a separate attacker/performance baseline, and an asset manifest cannot replace a candidate-versus-minifier adversarial burden experiment.

Decision requested of release integrators: explicitly choose legacy permissive public assets or an opt-in reviewed-asset manifest, rather than continually implying format-by-format preflights can certify source absence. This proposal creates an auditable deployment boundary with explicit trust assumptions, without promising hostile-runtime integrity or prevention of functional cloning.
