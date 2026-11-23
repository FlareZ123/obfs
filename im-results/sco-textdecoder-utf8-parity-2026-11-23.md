# SCO UTF-8 decoder Node/Chromium parity expansion (23 November 2026)

## Status and source pin

This is **intermediate cross-runtime compatibility evidence**. It does not establish source confidentiality, anti-instrumentation resistance, all-browser semantic equivalence, or a universal 2.5× compute guarantee.

- Exact validated source: `1a18a06f0ca85bc44d4039b0da50bb66906a286d`.
- Change introducing the corpus: `f6b3b40365b1d6ccdec9a8664f4d50c1254ab47a`.
- [Manual workflow run 45107645226](https://github.com/FlareZ123/obfs/actions/runs/45107645226), two successful Ubuntu jobs.
- Test: `test/sco-textdecoder-realm-browser.js`.
- Workflow: `.github/workflows/manual-sco-textdecoder-compat.yml`, manually dispatched on `main`.

## Test construction

The test applies the same non-streaming `TextDecoder(label).decode(Uint8Array.from(bytes))` in native Node and Chromium 157.0.8103.78 and compares resulting Unicode code points. The bounded sample consists of:

1. Three retained baseline cases: `windows-1252` byte 0x80, `gbk` byte 0xff, and `utf-8` ASCII bytes 65 and 66.
2. Seventeen UTF-8 edge vectors spanning empty input, ASCII boundaries, valid 2/3/4-byte characters, leading BOM, isolated continuation bytes, truncated sequences, overlong encodings, surrogate encoding, out-of-range code points, and malformed/valid mixtures.
3. All 256 single-byte UTF-8 inputs 0x00 through 0xff.
4. Two accepted UTF-8 aliases: `UTF8` and `unicode-1-1-utf-8`.

Total: **278 cases**, including **276 UTF-8 cases**. The additional UTF-8 vectors are a direct native decoder comparison, independent of the obfuscator. The original source-admission test in `test/sco-private-host-effect-closure.test.js` separately exercises the compiler's refusal of legacy labels and acceptance of directly constructed UTF-8 decoder forms.

## Results

| Native runtime | Browser | UTF-8 mismatches | Legacy mismatches | Job |
| --- | --- | ---: | ---: | --- |
| Node 22.16.0 | Chrome 157.0.8103.78 | 0/276 | 2/2 | Passed, 137472491965 |
| Node 22.23.5 | Chrome 157.0.8103.78 | 0/276 | 0/2 | Passed, 137472491743 |

On Node 22.16.0, the `windows-1252` input 0x80 produced U+0080 versus Chrome U+20AC. The `gbk` input 0xff produced U+F8F5 versus Chrome U+FFFD. This is an actual cross-host witness for why static relocation cannot admit those two legacy-label examples without qualification. The observed newer Node equality does not justify admitting arbitrary legacy labels across permitted Node/browser versions.

## Boundaries

The corpus covers direct non-streaming decode with default constructor options on the recorded runtimes. It does not cover every multibyte sequence, UTF-8 streaming chunk boundary, nondefault `fatal` or `ignoreBOM` configurations, browser extension engines, locale-specific encodings, user-defined globals, or hostile runtime changes. No obfuscated program runtime ratio was measured by this witness.

The source-admission implementation's allowance for a syntactically direct UTF-8 constructor is still only a bounded conservative policy. Test improvements belong in intermediate evidence until an attacker-cost or application-level correctness advantage is demonstrated.
