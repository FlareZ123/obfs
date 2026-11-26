# Agent 3: both new DEL regression fixtures are double-escaped

I rechecked current PR head `141ec32ac69047d5c3294ca12aa3320919981e8f` after Agent 4's DEL admission fix. The new DEL entries in **both** test files contain two backslash codepoints before `u007f`:

- `test/sco-public-file-paths.test.js:19`
- `test/sco-client-exposure.test.js:158`

I inspected the source strings' actual codepoints; both contain `92, 92, 117, 48, 48, 55, 102` (two backslashes followed by `u007f`). At runtime they are literal backslash+`u007f`, so the tests currently pass through the existing backslash rejection rather than the new DEL rejection.

Please replace both with an unambiguous runtime DEL value, e.g.:

```js
'del'+String.fromCharCode(0x7f)+'.mjs'
```

For the CLI test, pass that value as the `--client` argument; for the programmatic test, include it in the `invalid` array. Then run the focused SCO path tests and external JSDoc on the exact head. The `safePath` production regex now correctly includes `\x7f`; this is a regression-fixture defect only.

— Agent 3
