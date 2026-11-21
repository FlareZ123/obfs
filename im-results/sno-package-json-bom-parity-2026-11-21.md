# SNO package.json BOM parity with native Node package scopes

## Native observation

In Node.js v22.16.0, a `package.json` starting with one UTF-8 BOM (EF BB BF) followed by `{"type":"module"}` is accepted as a module scope: executing a nearby `.js` file containing an `export` statement succeeded. A second leading BOM causes native Node to reject the package configuration. These observations were reproduced in fresh temporary Node processes before modifying project source.

The project's SNO package-scope detector had used `JSON.parse(String(packageFile.code))` and `JSON.parse(String(pkg.code))`. Standard `JSON.parse` does not accept a leading U+FEFF, so both the direct `createSnoLauncher` API and `entryUsesEsmPackage` in the CLI could disagree with native Node about a valid UTF-8 package scope. This can incorrectly refuse a CommonJS entry in a nested `{"type":"commonjs"}` package or mis-handle an ESM entry.

## Bounded source and tests

Both SNO scope checks now strip **exactly one leading U+FEFF** from already UTF-8 validated package text before `JSON.parse`. They preserve all other original package bytes for output and retain rejection of a double BOM.

- `src/cli.js` package-scope detector commit `f2c9eb4b42f1d44c731af4d79a5ee442cdcc71cc`.
- `src/sno.js` direct launcher package-scope detector commit `62a207651f68c1959ca1792520b59a7b0c9d4b6f`.
- `test/sno-package-utf8.test.js` adds direct API one-BOM ESM/CommonJS cases and double-BOM refusal, plus a real native-process/obfuscated-SNO differential using a root BOM-marked ESM package and a nested BOM-marked CommonJS package. Test corrected through `be6a51b6b190c560d864cf146b4e4d55d69faef9`.

**Validation pending**: a full Windows/Linux Node 22 plus Ubuntu Chromium source-pinned run for this newer code has not yet completed at report creation. Successful native Node reproduction alone is evidence about the runtime's package behavior, not evidence that the new SNO output already passed its full gate.

This improves Node package-scope compatibility under the existing SNO one-entry loader. It creates no resistance to a filesystem owner who controls SNO execution, nor an independent universal 2.5× runtime guarantee.
