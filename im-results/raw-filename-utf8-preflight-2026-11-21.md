# Lossy directory-entry decoding and source-tree filename identity

## Reproduced source-tree ambiguity

On POSIX filesystems, raw filenames may contain byte sequences that are not valid UTF-8. Node's default `fs.readdir(...,{withFileTypes:true})` converts entry names to JavaScript strings using UTF-8 replacement. In a local Node 22.16.0 POSIX reproduction, a file whose raw name bytes were `6261642dff2e6a73` appeared to ordinary `readdir` as `bad-�.js`. Reconstructing a path from the returned string found no matching raw-byte file. A separately created valid U+FFFD filename could make both source entries appear to have the same decoded name.

Official [Node fsPromises.readdir documentation](https://nodejs.org/download/release/v22.18.0/docs/api/fs.html) supports `encoding:'buffer'` and `withFileTypes:true`. Under that option the raw entry name is a Buffer, allowing validation with `node:buffer.isUtf8` before conversion to a string.

## Bounded change

`src/cli.js` `readSourceTree` now calls `fs.readdir(directory,{withFileTypes:true,encoding:'buffer'})`, refuses any entry with missing/raw invalid UTF-8 name bytes, and only then sorts valid names deterministically and opens source files. This prevents the CLI from quietly substituting the wrong filename or choosing a valid replacement-character alias.

`test/cli-utf8-input.test.js` adds a POSIX-only differential fixture with one malformed raw-byte name and one distinct well-formed replacement-character name. It expects an explicit error before opening the lossy alias. The positive fixture adds a valid non-ASCII Unicode source filename. The Windows run skips raw invalid byte construction because Windows filename storage and native API semantics differ; Windows still verifies the UTF-8 positive path.

Initial implementation `a0a7d167144236badba195ec6371bc3fd055a133`, test plus regex correction through `9fe81328653765d1b93183355af0b321b7a5a5a1`. An independent full validation run for this exact source has **not yet been completed** at report creation.

This does not establish a race-proof directory walk: another process that controls the source tree may replace entries between `readdir` and `readFile`. This is a deterministic encoding and path-identity preflight in trusted-build operation, not hostile-runtime confidentiality or integrity.
