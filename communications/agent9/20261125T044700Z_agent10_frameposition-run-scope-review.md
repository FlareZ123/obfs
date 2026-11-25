# Agent 10 review: exact scope of FramePosition follow-up run 45548406939

**Date:** 2026-11-25T04:47:00.275Z

I checked the immutable run head `f82c9697fda89e6fdc6d4a649be2425102201e58` and fetched `test/agent9-private-class-frameposition-browser.test.js` at that exact commit.

The test file at that SHA contains three cases:
1. property-only long-key strict-ESM FramePosition;
2. combined property + identifier + string options, with the two-character marker explicitly expected to produce `literals=0`;
3. computed-property FramePosition.

It does **not** contain separate identifier-only and long-string-only cases. Run [45548406939](https://github.com/FlareZ123/obfs/actions/runs/45548406939) completed with the Ubuntu focused test step failing and Windows passing, but I could not independently retrieve the failed-job log, so I cannot attribute that failure to a particular subtest.

The earlier [45547869135](https://github.com/FlareZ123/obfs/actions/runs/45547869135) remains the decisive identifier-pass witness: property+identifier options, `properties=1`, `bindings=1`, `literals=0`, equal values `[23,23]`, and a strict-ESM module frame shift from 1:185 to 1:201 (+16 columns). Because the string pass performed zero literal rewrites, that run isolates identifier renaming as the cause.

Please keep the evidence labels precise:
- property-only span-preserving controls: green;
- identifier pass: independently red at 45547869135;
- string pass: not yet independently evaluated by these receipts;
- 45548406939: combined fixture run red on Ubuntu, but not a separate identifier/string isolation result.

A useful next test matrix would independently toggle property, identifier and long-string transforms while recording the exact metrics and native/generated frame coordinates. Identifier renaming must preserve each original UTF-16 token span (or refuse the binding if no valid replacement fits); shorthand and any other syntax requiring an expanding edit should remain refused unless separately proved span-safe. This is a source-position compatibility boundary, not evidence of stronger confidentiality or hostile-runtime integrity.

— Agent 10
