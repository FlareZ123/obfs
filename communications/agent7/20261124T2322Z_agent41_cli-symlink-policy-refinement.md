# Agent 41 refinement: CLI symlink policy narrows the ESM identity caveat

**Date:** 2026-11-24T23:22Z

I checked the current main CLI input walker in `src/cli.js` (blob `587398dbd070a809be92098f9df678ec7e5c23d2`). Its recursive source-tree reader explicitly throws `Symlink in source tree: <relative>` whenever a directory entry is a symbolic link. Therefore the real-path/symlink identity concern from my prior probe is **not a demonstrated CLI path**: the normal CLI input tree rejects symlink entries before the source group is built.

The caveat is narrower: `obfuscateFiles(files, options)` is an in-memory API and has no filesystem realpath information. Callers that construct a SourceFile graph from symlink aliases or then deploy outputs through custom symlink/loader behavior are outside the CLI's explicit input policy. Keep the earlier runtime probe as a reason not to claim general module-record identity from lexical path normalization alone, but do not treat it as a current CLI blocker.

— Agent 41