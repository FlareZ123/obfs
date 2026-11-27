# ESM URL path-boundary audit — 26 November 2026

## Question

Does the terminal-dot URL identity fix leave another accepted mismatch between WHATWG URL resolution and POSIX path normalization in the SCO CLI, cross-file property analysis, or ESM graph guards? The adversarial dimensions checked were trailing slashes, dot segments followed by trailing slashes, percent-encoded dot and separator forms, query strings, and fragments.

## Reproducible bounded model

Run:

    node sims/esm-url-path-identity-audit.js

The script compares a mirror of the SCO CLI's segment admission and POSIX target derivation with WHATWG URL resolution followed by the SCO handler's one-decode-per-segment lookup. It also models the cross-properties graph preflight and exact POSIX target lookup. It is a bounded model, not a proof and not a direct invocation of private CLI helpers.

The run used Node v22.16.0 and enumerated 1,429,428 unique specifier strings: 21 path-segment atoms, lengths one through four, and seven suffix forms covering empty suffix, trailing slash, query, fragment, combined query/fragment, and dot-like text inside query/fragment.

| Resolver model | Accepted candidates | URL/path-key mismatches |
|---|---:|---:|
| SCO candidate before terminal-dot refusal | 134,484 | 22,284 |
| SCO candidate with terminal-dot refusal | 112,200 | 0 |
| Cross-properties graph preflight + strict resolver | 1,268 | 0 |

All 22,284 pre-fix SCO mismatches had a final literal dot or dot-dot path segment. Of these, 15,984 had a file-shaped target that did not collide with an ancestor directory of the entry path in the simplified path check. The concrete witness is:

- Specifier: ./private.mjs/.
- POSIX candidate target: app/private.mjs
- WHATWG URL pathname: /app/private.mjs/
- SCO handler lookup key: app/private.mjs/

The terminal-dot guard rejects the witness and all other mismatches in the generated grammar. Literal interior dot segments remain admitted when POSIX and WHATWG resolution agree.

The cross-properties model accepted only canonical relative paths after rejecting query/fragment, percent escapes, backslashes, repeated separators, and terminal dot segments. Its remaining trailing-slash paths retained the slash in both URL and POSIX keys; ordinary file groups do not accidentally match a slashless file. The file-shaped-target count is only a simplified candidate count, not a claim that every candidate is a reachable or exploitable file group.

## Source inspection

- SCO CLI selection in src/cli.js strips raw query/fragment suffixes before resolving the pathname, rejects empty path segments (including a trailing slash), rejects terminal dot segments, decodes each segment once, and refuses decoded slash, backslash, NUL, and percent-encoded whole dot/dot-dot segments.
- SCO serving in src/sco.js uses url.pathname (so query and fragment are not part of the lookup path), decodes each path segment once, and refuses dot/dot-dot, slash, backslash, and NUL after decoding.
- Cross-file property analysis in src/cross-properties.js has a graph-wide static-import preflight that refuses query/fragment, percent, backslash, repeated separators, non-relative or unlisted imports, and terminal dot segments. The private resolveImport helper now repeats the query/fragment/percent/backslash refusal itself as defense in depth, so future call sites cannot accidentally rely only on the outer preflight.
- Host-lock graph completeness, static ESM decoder dependency admission, and source-observer island import resolution in src/core.js and src/source-observer-islands.js reject query/fragment, percent, backslash, repeated separators, and terminal dot segments before accepting an exact in-group target.
- A specifier such as ./folder/../state.mjs/ retains a trailing slash under URL resolution and POSIX normalization; it does not resolve to the slashless state.mjs input. The new cross-file regression test exercises this fail-closed case.

The focused callsite test also contains a canonical positive control (one cross-file property proof) and negative controls for query, fragment, encoded dot, encoded separator, and trailing-slash spellings. The encoded-dot and encoded-separator decoy files are placed under a sibling folder so the test does not create an unrelated file/directory path conflict.

## Conclusion and limits

No additional URL/POSIX path-key mismatch was found in this bounded grammar after the terminal-dot refusal. The source inspection and regression tests support the same result for the named graph consumers. This does not prove equivalence for arbitrary custom loaders, import maps, symlinked deployments, server rewrites, or every possible URL spelling; those remain deployment-contract boundaries and should not be described as statically proven.

A direct in-memory source-file key ending in a slash is a separate portability question: the current path validator can represent such a key even though ordinary filesystem files cannot end in a separator. It is not an observed URL/POSIX alias in this model, and the SCO CLI's filesystem walk cannot produce it. Decide separately whether the public in-memory API should reject directory-shaped file keys for stricter Node filesystem compatibility.
