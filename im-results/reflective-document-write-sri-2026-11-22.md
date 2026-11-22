# Reflective and detached Document writers can insert hash-pinned sibling scripts

**Status:** Red-first compatibility defect reproduced across Ubuntu/Windows, repaired by a bounded source observer, with comprehensive gate and merge status recorded when available.
**Modes:** COO/SCO/SNO browser publication; source-byte parity, not hostile client confidentiality.

## Mechanism and red witness

The browser HTML parser can process markup through the native method reached via `document.write.call(document, markup)`, `document.write.apply(document, [markup])`, `Reflect.apply(document.write, document, [markup])`, or a local alias of `document.write` invoked with one of those dispatch mechanisms. Such code can insert a script with Subresource Integrity metadata, thereby pinning the exact bytes of a sibling JavaScript resource. These calls bypassed the existing source observer because its direct writer guard expected the callee's immediate receiver to be a Document.

The independent new `test/reflective-document-write-sri.test.js` required original sibling bytes under all three modes for five reflective or aliased calls, while requiring transformation yield for unpinned source and unrelated local call functions. **Red-first** [Ubuntu/Windows run 45074174939](https://github.com/FlareZ123/obfs/actions/runs/45074174939) at `a1a2d26595dfb107488d0834ae62b3a3ce3fa33c` failed with the actual XOR-encoded `client.js` output for `document.write.call(document, pinnedMarkup)`.

## Bounded repair

`src/ast.js` now recognizes a local expression referencing native Document `write` or `writeln`, including an unknown computed selector that could evaluate to either. A fixed-point may-alias set propagates the expression through simple variable bindings. Source-visible reflective dispatch through `.call`, `.apply`, `.bind` or `Reflect.apply` reuses the same HTML concatenation and incomplete-tag tests as direct document writers. For `.apply`/Reflect, unknown arrays are conservatively observed. A proven benign complete HTML string does not force a source veto. This static compatibility repair adds no runtime instrumentation.

Focused [Ubuntu/Windows run 45074292762](https://github.com/FlareZ123/obfs/actions/runs/45074292762) at code `d5e2098c992567c070782c52e881eb2497a15cea` **passed** with five pinned patterns and a no-SRI/rewrite-yield control. Extra no-SRI controls for native apply, Reflect.apply and aliased call were added in the successor candidate. The extended `test/document-write-sri-browser.js` tests native/guarded/byte-mutated Chromium outcomes for three new reflective parser-injection forms alongside the prior cases.

## Boundaries

The proof is intentionally local and syntactic: unknown higher-order functions, cross-file method aliases, mutation of native prototypes and other dynamic HTML writers remain unproved. Conservatively treating an opaque native writer reference as possible source exposure can reduce transformation yield. This evidence is not a source secrecy, anti-debugging, host-enforcement or global 2.5× budget claim; the overall strong-protection release remains **BLOCKED**.
