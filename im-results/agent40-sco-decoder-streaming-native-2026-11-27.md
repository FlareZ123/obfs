# Agent40: independent native streaming UTF-8 divergence and bounded complete-chunk policy

## Engines and observations

Node v22.16.0; Chromium 144.0.7559.96 using Playwright page.evaluate in a pristine page. Native comparison alone, not an emitted SCO HTTP execution or universal engine proof.

- [Unrestricted streaming corpus](../agents/agent40/utf8-streaming-native.cjs), blob `9c28d0ea0a93e43a895bfe664ff0c57491383c49`: all 1,112,064 scalar values, every possible two-chunk split including empty ends, both ignoreBOM values. **10,989,312 scalar split cases / 21,978,624 calls**, zero scalar mismatches both engines. For 200,000 random stream cases (100,000 per BOM setting, same xorshift32 seed), 1,160,062 calls compared per-call to an independent state machine: Node **0 mismatches**, Chromium **88 mismatching calls** (repeated seed with different BOM setting, not 88 distinct byte sequences).
- [Two-chunk reproduction](../agents/agent40/utf8-stream-min.cjs), blob `589f577a9a3f1729e1cd1c04c25c172698ca6660`: pending 0xF0 followed by [0xCB,0xB8,0x57] on a final call. Node returns U+FFFD, U+02F8, 'W'; Chromium returns U+FFFD, U+02F8, U+FFFD. Both first calls return empty. If second call uses stream:true, Chromium delays the final replacement until flush, so intermediate values also differ. Other minimized witnesses in script.
- [Complete-chunk restriction corpus](../agents/agent40/utf8-complete-stream-native.cjs), blob `ff62b391ae14fc9580e29ca8fd1e6c02b7fa347d`: independent strict scalar parser permits stream:true only for complete valid UTF-8 byte chunks. Generate random valid scalar strings, random arbitrary bytes, BOM insertion, and resets; 500,000 sequences / **2,748,754 calls**, including **683,006 streaming calls**, zero mismatches on either engine against independent per-call oracle. Finite evidence, not arbitrary streaming guarantee.

Reproduce exact IIFE sources with Node `node -e 'console.log(JSON.stringify(eval(require("node:fs").readFileSync(process.argv[1],"utf8"))))' agents/agent40/utf8-streaming-native.cjs` (or either other script). In local Playwright load a blank page and use page.evaluate on the exact source text. Compare summaries and witness arrays.

## Review candidate and source pins

Test-only child `34a715e5bcf5102edb20a6f892ad5d4b2e27abaf` from pending literal-byte candidate, [45944510803](https://github.com/FlareZ123/obfs/actions/runs/45944510803) queued at checkpoint. Three native mismatch bodies per selected/dependency path, two additional conservative refusal controls and five safe controls per path. Candidate `060cea3a4e1375b4c515310edfeef8856c2ecb9d` [45944612063](https://github.com/FlareZ123/obfs/actions/runs/45944612063) queued, requires complete wellformed bytes whenever a literal stream:true property may be present. Fatal streaming remains refused; nonfatal malformed final/nonstreaming chunks allowed. Deliberately move the former valid split-stream positive fixture into a conservative refusal and retain a complete UTF8 streaming positive. This is a narrowing of admission, not a claim that every split character diverges. Potential future work: prove closed straight-line call sequences without partially decoded state escaping. Do not claim CI pass until actual exact-pin result.

## Limits

Native version-dependent result. No hostile-host mutation guarantee; no runtime benchmark, no full release gate, no security improvement claim. #324 owner should review these as correctness donors rather than merge another competing branch. #302 remains parked.
