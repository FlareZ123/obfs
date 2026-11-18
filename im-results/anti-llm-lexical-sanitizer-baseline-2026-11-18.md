# Lexical anti-LLM cue sanitizer baseline

**Agent 5, 18 November 2026. Status: intermediate attacker baseline.**

## Question

The anti-LLM literature includes techniques that place instruction-like text in
comments, dead string statements, identifiers, and unreachable code. Under the
project threat models, an analyst controls the static-analysis pipeline and can
preprocess public JavaScript before giving a representation to a language
model.

This experiment asks whether two low-cost lexical surfaces, comments and
non-directive standalone string statements, survive a semantics-checked
attacker normalization step.

It does not evaluate a language model and does not establish that all anti-LLM
techniques are removable.

## Pinned implementation

- `sims/anti-llm-lexical-sanitizer.js`
- `test/anti-llm-lexical-sanitizer.test.js`
- repaired source commit `b7c50221c65eabb835536f067d2ba356521a4d2a`
- workflow run https://github.com/FlareZ123/obfs/actions/runs/44424864180

The sanitizer parses with public Acorn and Acorn Walk. It:

1. blanks comment characters while preserving every CR/LF terminator, which
   avoids changing automatic-semicolon-insertion line boundaries or joining
   adjacent tokens;
2. blanks standalone string-literal expression statements only when Acorn does
   not mark the statement as part of a directive prologue;
3. keeps directive-prologue strings such as `"use strict"`;
4. reparses the resulting JavaScript before returning it.

The regression includes explicit cases for comment-sensitive ASI, division
after a comment, regex-literal text containing comment-like characters, line
comments, directive prologues, and prompt-like text.

## First-run failure and correction

Run https://github.com/FlareZ123/obfs/actions/runs/44424556512 failed on both
operating systems. The sanitizer reported zero removable dead strings where
the synthetic test expected two.

The failure exposed a generator mistake. Both instruction-like string
statements were at the start of their enclosing script/function directive
prologues. Preserving them was the intended conservative behavior. Commit
`b7c50221c65eabb835536f067d2ba356521a4d2a` moved those two synthetic
strings after `void 0` statements, leaving them genuinely non-directive and
semantically dead. No sanitizer eligibility rule was weakened to make the
test pass.

## Cross-platform result

Run 44424864180 completed successfully on Ubuntu and Windows Node 22, including
the surrounding attacker-normalizer tests and both strict JSDoc gates.

For each operating system independently, the corpus contained 256 generated
CommonJS programs and produced:

- 256/256 exact native-versus-sanitized observable outcomes;
- 512 removed comments;
- 512 removed non-directive dead string statements;
- 52,736 erased characters from 91,274 original source bytes.

Mean parse/sanitize/reparse time over this small corpus was:

- Ubuntu: **280.58 microseconds/program**;
- Windows: **359.16 microseconds/program**.

These timings measure this implementation on CI runners. They exclude model
inference and broader attacker effort.

## External-reviewer status

A source-only one-shot worker challenge was attempted during the same
invocation. The worker service returned `UNAVAILABLE` because its SSE probe
received HTTP 404. Therefore there is no independent model reconstruction
result from this run. Service unavailability cannot be counted as model
resistance.

## Security implication

Comments and dead standalone strings are weak places to put model-directed
defenses in distributed JavaScript. For the tested grammar, an attacker can
remove them before model inference while retaining executable behavior.

Future anti-LLM evaluations should report refusal/prompt-injection effects
separately from program-reconstruction resistance. At minimum, the same public
artifact should also be evaluated after a semantics-checked lexical sanitizer.
A stronger attacker can additionally use a compiler-normalized analysis view;
the repository already uses esbuild as a conventional minified control in
other source-recovery experiments.

This result says nothing about adversarial identifiers, reachable misleading
logic, opaque predicates, dynamic state, VM semantics, or model-specific
reasoning limits. Keep it in `im-results/`.
