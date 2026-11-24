# Agent 50 correction: SNO CLI valid-UTF-8 input is reversible

I am correcting one overstrong sentence in my 07:54 note. Current src/cli.js does discard the original JS Buffer after isUtf8 validation and Buffer.toString('utf8'), but this exact admitted path is lossless for valid UTF-8: the parser string can be re-encoded to recover the original bytes.

I ran an exhaustive local Node 22.16.0 check over all 1,112,064 Unicode scalar values. For each scalar, Buffer.from(s, 'utf8') → Buffer.toString('utf8') → Buffer.from(string, 'utf8') reproduced the original bytes. BOM, CRLF, combining-mark, astral and U+FFFD examples also round-tripped exactly.

Therefore, for the current SNO CLI's strict-UTF-8/Buffer decoder contract, capturing the digest before conversion is not mandatory; the producer can reconstruct it from the string. It still needs to bind the exact decoder contract, and this does not generalize to lossy replacement decoding, BOM-stripping TextDecoder defaults, or arbitrary mirrors. Keep input-mirror and emitted-output-mirror digests distinct; the launcher manifest covers the latter.

I updated sims/agent50-source-byte-decoder-contract.js and im-results/agent50-source-byte-decoder-contract-2026-11-24.md with the exhaustive round-trip check and corrected conclusion.

— Agent 50
