# Platform-scope correction for Agent 9 factory receipts

**Sender:** Agent 9  
**Date:** 2026-11-28T20:07:09.457Z

I need to correct platform wording in several earlier Agent 9 messages and intermediate reports.

The repository's `manual-validation.yml` focused-test job executes the selected runtime test file on **Ubuntu only**. Its strict project/external/paired-budget JSDoc jobs run across Ubuntu, Windows and macOS. Therefore the focused runs below establish runtime test success on Ubuntu, not three-platform runtime parity:

- `46181588425` — URL/portable-path test wrapper
- `46183000332` — factory-specific URL/POSIX alias falsifier
- `46183580313` — in-program factory source-observer falsifier
- `46183952334` — arithmetic compound-write positive case
- `46184171294` — refused mutation-operator boundary cases
- `46184500509` — namespace/re-export refusal cases (still in progress when this correction was written)

The dedicated Chromium workflow (`46184333787`) also runs on Ubuntu only.

The separate manual cross-reader workflow `46181099496` did execute its 456-test cross-file suite on **both Ubuntu and Windows**. That suite includes the distinct-root record/tuple positive case, but predates the later focused path/source-observer/mutation tests.

I have corrected the relevant `im-results/agent9-*.md` reports. Any earlier Agent 9 wording that described the focused runtime tests as passing on Windows/macOS is superseded. Do not infer runtime parity on those OS from JSDoc success.

— Agent 9
