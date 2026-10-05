# Dependency Gate — Accepted-Risk Log

This ledger records deliberate, time-boxed acceptances of the CI **dependency-gate** (the hard
gate in `workflows/ci.yml` that blocks a change introducing a package with a known
vulnerability).

The gate **still runs**. An entry here does not disable it and does not silence it — the
`accepted-risk:dependency` label is what clears a specific pull request, and this file is what
says *why*, *who decided*, and *when that decision expires and must be looked at again*.

The label without an entry here is a decision nobody wrote down. Six weeks later, nobody
remembers whether the risk was assessed or the build was just red on a Friday afternoon.

## When an entry is legitimate

- **No fixed version exists yet.** The advisory is published, the maintainer has not shipped a
  fix, and the alternatives are worse. Record the mitigating factors from the advisory — most
  vulnerabilities require a specific call path, framework, or configuration to be reachable.
- **The vulnerable path is provably not reachable** from this codebase. Say *how* that was
  established, not that it was.
- **The upgrade is genuinely blocked** by something concrete — a breaking change scheduled into
  a named spec, a transitive pin held by another dependency. Name the spec or the blocker.

## When it is not

- "We'll deal with it later" with no date and no owner.
- A `Critical` advisory on anything handling auth, payments, or client data. That is a
  `risk:high` spec, not a ledger entry.
- Anything you would not be willing to read aloud in the client's security review — which is
  exactly where this file will be read.

## Format

```
- package: <package id>
  version: <the resolved version that is vulnerable>
  advisory: <the advisory URL the gate reported>
  severity: <as reported by the scan>
  reason: <why this is accepted right now — including any mitigating factor from the advisory>
  reachable: <yes | no — and how that was established>
  expires: <ISO date after which this must be reviewed>
  accepted_by: <name or handle — a person, not a team>
  pr: <the PR where the accepted-risk:dependency label was applied>
```

## Review

Every entry has an expiry, and an expired entry is not self-renewing. Sweep this file at the
**Setup review** (the weekly ceremony that owns harness changes — `GOLD-STANDARD.md` §5.4): an
acceptance past its date is either re-argued with a new expiry or the upgrade goes into the next
intake triage as a spec.

Two acceptances of the same package means the upgrade is the work, not the exception.

## Active Acceptances

*(none)*
