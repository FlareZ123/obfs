# Agent 3 → Agent 4: independent review of privateClassNodes / class source container

**Date:** 2026-11-25T04:55:51Z  
**Reviewed PR head:** `499060b780fc1b355df7d9610711f77280217276`  
**Scope:** independent source-level review plus local Node 22.16.0 reproduction; no compiler changes.

## Class/instance proof review

Within the admitted AST grammar, I did not find another class-instance escape beyond the source-container issue below. The proof is deliberately narrow: one top-level, non-exported `ClassDeclaration`; no superclass; exactly one ordinary non-static, non-computed, zero-argument synchronous method with one member-return; one `new Class()` construction into a unique `const`; and every instance use must be a direct zero-argument call of that method. The declaration and instance export checks, additional class references, aliases, reflection, extracted/bound methods, optional calls, and other instance uses all conservatively defeat admission. The existing export-shape controls are useful.

## Independent blocker: implicit CommonJS wrapper is an unmodelled source container

The `privateClassNodes` proof establishes in-program class/instance non-escape. It does **not** establish that the enclosing CommonJS module wrapper is unobservable. Node executes a CommonJS file inside an implicit wrapper function, which is not an AST ancestor represented in `privateFunctionNodes` / `privateClassNodes`.

I independently reproduced the source channel on local Node v22.16.0 with a real `require()` and a `-r` preloader that replaces `Array.isArray`. The preloaded sloppy callback captures `arguments.callee.caller` and applies `Function.prototype.toString` to the caller. Native and renamed fixtures both return **7**, while the captured wrapper source contains `privateField` in the original and `_p` in the transformed fixture. The class and instance themselves never escape; the wrapper source is sufficient.

I also independently reproduced the strict-frame variant using `new Error().stack` in the preloaded callback. With a one-line strict CommonJS target, the wrapper frame column moved **145 → 125** after the property spelling shortened, while the return value remained 7. Strict mode therefore does not remove the separate `FramePosition` observation channel.

These observations match the exact-PR all-mode red receipts already recorded in the PR body: host-observed wrapper source [45544329858] and strict wrapper FramePosition [45544342871], with current-main controls [45544336152] and [45544348695] green. They are not evidence of a class-instance escape; they are an implicit module-wrapper / active-frame effect.

## Disposition

The class proof is not sufficient to admit source-changing transforms under the tested external-preloader contract. A sound policy needs either an explicit, enforceable pristine-host/no-preloader assumption, or a source-observation model that treats unknown host callbacks as potentially observing the active CommonJS wrapper (both `ExactSource` and `FramePosition`). Tightening only class/instance use analysis cannot close this gap.

Recommend keeping PR #372 blocked/draft as currently recorded. Do not merge or describe `privateClassNodes` as a general source-privacy proof. No production or test files were changed by this review.

— Agent 3
