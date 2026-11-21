# Win32 console-name path probe: directory-qualified names remain ordinary files

**21 November 2026 | Agent 5 | bounded portability and admission-policy counterexample.**

## Hypothesis and result

Win32 exposes special console names `CONIN$` and `CONOUT$`. An initial hypothesis suggested that the obfuscator's POSIX-relative source-tree inventory should reject those strings as file path segments, like it already rejects `CON` and `NUL`.

A live Node 22 Windows filesystem test **falsified that proposed rejection** for the paths actually used by the compiler. `path.join(tempdir,'CONIN$')`, `CONOUT$` and their `.txt` variants were regular, writable, `lstat`-able and readable files under the runner's temporary directory; each returned the exact source bytes `witness`. This is a test of **directory-qualified filesystem paths**. It does not claim that unqualified `CONIN$` and `CONOUT$` passed directly to a Win32 console API have ordinary-file semantics.

Official background: Microsoft's [Console Handles](https://learn.microsoft.com/en-us/windows/console/console-handles) documents special console handle acquisition, and [Naming Files](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file) documents reserved device spelling. Neither substitutes for this Node-specific, qualified-path runtime test.

## Reproducible before/after source and jobs

The frozen test-only branch `agent5/windows-console-device-probe-20261121` initially used an intentionally pessimistic refusal oracle at SHA `a1d3472a946e948385baf5427f71b602f1fe5e58`. [Two-OS run 44960355455](https://github.com/FlareZ123/obfs/actions/runs/44960355455) recorded **four test expectation failures per OS**, all because the compiler admitted the proposed names. Independently, its native Windows audit printed:

```text
WIN32_DEVICE_PATH_AUDIT {"device":"CONIN$","readback":"witness"}
WIN32_DEVICE_PATH_AUDIT {"device":"CONOUT$","readback":"witness"}
WIN32_DEVICE_PATH_AUDIT {"device":"CONIN$.txt","readback":"witness"}
WIN32_DEVICE_PATH_AUDIT {"device":"CONOUT$.txt","readback":"witness"}
```

The corrected branch SHA `79b25ebe186719a359cac9d7d54ab3defeabb2b8` changes the oracle to **positive** admission: COO/SNO/SCO compiler modes preserve all expected asset paths, and both direct SNO/SCO construction surfaces allow them. It asserts the same physical Windows write, `lstat`, and exact read-back. The [two-platform full validation run 44960761551](https://github.com/FlareZ123/obfs/actions/runs/44960761551) completed **successfully** on Ubuntu and Windows at that exact SHA, including existing behavioral suites, strict JSDoc, sampled benchmarks and Ubuntu Chromium integration.

## Engineering decision

**Preserve the current `src/core.js::safePath` policy.** An added `CONIN$`/`CONOUT$` segment ban would reject demonstrated valid Node output filenames and reduce compatibility without a verified path hazard. The narrow positive regression preserves the distinction for future path-policy changes.

The evidence is limited to Node 22's Windows CI filesystem configuration and selected spellings. It does not establish behavior across every Win32 namespace syntax or filesystem version. There is no source confidentiality, tamper resistance, host admission, or security-performance improvement. The primary strong-obfuscation release remains **RELEASE-BLOCKED**.
