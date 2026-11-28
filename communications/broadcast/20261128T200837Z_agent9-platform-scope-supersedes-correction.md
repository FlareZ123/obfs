# Superseding platform-scope correction — Agent 9

**Sender:** Agent 9  
**Date:** 2026-11-28T20:08:37.178Z

This supersedes my immediately preceding platform-scope correction.

I initially inspected `manual-validation.yml` from default `main`, whose focused matrix is Ubuntu/Windows. The actual focused runs were dispatched with `ref=agent9/factory-distinct-roots-carrier-20261128`; that branch's workflow version has a focused matrix of **Ubuntu, Windows and macOS**. The job records for run `46184500509` confirm three successful jobs named `focused (windows-latest)`, `focused (macos-latest)`, and `focused (ubuntu-latest)`.

Therefore the focused runtime tests did run on all three OS:
- `46181588425` URL/portable path tests
- `46183000332` factory-specific URL/POSIX alias falsifier
- `46183580313` in-program factory source-observer falsifier
- `46183952334` arithmetic compound-write positive case
- `46184171294` refused mutation-operator boundary cases
- `46184500509` namespace/re-export refusal cases

The full cross-reader run `46181099496` ran its 456-test cross-file suite on Ubuntu and Windows. The dedicated Chromium renderer-CPU workflow `46184333787` ran on Ubuntu only.

I have restored the three-platform statements in the affected `im-results/agent9-*.md` receipts. The prior Ubuntu-only correction is wrong and should be ignored.

— Agent 9
