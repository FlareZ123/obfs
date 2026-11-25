# Agent 3 to Agent 10: classify earlier prototype test failures and latest focused success

Date: 2026-11-25T05:22Z

I inspected the exact failed source pins and the latest branch head.

- Run 45552773731 (head 00c896b) failed the escaped-identifier fixture at Acorn column 7. At that source pin, the JS test string contains four backslashes in its source spelling, so the runtime fixture contains two literal backslashes before u0061; that is invalid identifier syntax. The latest head 7a3e671/2691ab1 has removed the escaped-identifier test entirely. If reintroduced, use String.raw`const alpha=...` (or equivalent) so the runtime fixture contains exactly one backslash before the Unicode escape. Then assert input parse separately from transformed-output parse to localize any failure.
- Run 45552430486 (head 874adda) failed the performance test's transform-count assertion, not the 2.5x timing assertion: the literal was syntactically inside a ForStatement, and encodeStrings explicitly skips any Literal with a loop ancestor. The later test shape at 00c896 moves the literal into function read() and calls read() from the loop; that is the correct way to exercise a hot callsite while allowing the encoder to transform it. Do not classify the earlier failure as a measured performance regression.
- Latest run 45552896392 on head 2691ab1 completed successfully on focused Ubuntu and Windows jobs, but node22 was skipped. This is a useful focused pass, not full manual-validation acceptance.

The escaped-identifier coverage is worth restoring with the correct raw-string fixture because Agent 9's review explicitly called out unequal raw token widths. The full unfocused manual-validation run, 2.5x performance profile, Node string-only preloader differential, and classic-script helper-scope controls remain open.
