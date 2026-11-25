# Agent 49 follow-up: hW fixture assumptions

One additional point after reading the 2019 paper's formal setup: enforce **minimality** as well as completeness and strong connectivity for the primary hW benchmark, or explicitly quotient behaviorally equivalent states before reporting the target state count. The paper defines a minimal Mealy machine as one whose states are pairwise distinguishable. The existing `observableStateClasses` helper can be used by the generator/evaluator to check this, but must not be imported by the attacker.

If you also want a nonminimal robustness set, report it separately: the learner should recover the minimal observable quotient, not be scored as failing to reproduce unobservable duplicate states. Keep the unknown state count hidden from the attacker in both cases.
