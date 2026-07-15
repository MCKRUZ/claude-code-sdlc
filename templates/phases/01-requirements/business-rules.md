# Business Rules
<!-- Phase 1 — Requirements | Optional artifact -->

Owned by **Bizreq**. A decision table of the business rules a feature must honor — the domain logic
that decides an outcome, independent of the channel it is delivered through. Each `BR-NN` becomes an
**Acceptance Check** on the spec that implements it (advisory / soft traceability), so a rule left
uncovered is a flag, never a silent gap.

The agent **proposes** rules from the source documents; a **named human** (the Approver) confirms each
one. A rule whose outcome depends on an undecided product question stays *pending* and points at the
`DL-NN` that must close first (see `decision-log.md`).

---

| Rule  | Condition                       | Outcome                                    | Source        | Approver |
|-------|---------------------------------|--------------------------------------------|---------------|----------|
| BR-01 | [when this condition holds]     | [the decision / action taken]              | [policy §N]   | [name/role] |
| BR-02 | [when this condition holds]     | [the decision / action taken]              | [policy §N]   | [name/role] |
| BR-03 | [ambiguous / edge condition]    | [action] *(pending <DL-NN>)*               | —             | [name/role] |

*Add one row per rule. Use `—` in **Source** when a rule has no documented basis yet (it likely needs a
decision-log entry). Mark a rule `*(pending <DL-NN>)*` when its outcome is blocked on an open decision;
drop the marker once that decision closes.*
