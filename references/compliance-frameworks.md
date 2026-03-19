# Compliance Frameworks Reference

Defines phase-level compliance gates for supported frameworks. Each framework specifies MUST-pass checks at specific SDLC phases.

## SOC 2 (Type II)

SOC 2 focuses on security, availability, processing integrity, confidentiality, and privacy.

### Phase Gates

| Phase | SOC 2 Requirement | Check |
|-------|-------------------|-------|
| 1 Requirements | CC6.1 — Logical access controls defined | Requirements include auth/authz specifications |
| 2 Design | CC6.6 — System boundaries defined | Architecture doc defines trust boundaries |
| 2 Design | CC7.1 — Change management process | ADR documents design decisions with rationale |
| 4 Implementation | CC6.1 — Access controls implemented | Auth/authz code present and tested |
| 5 Quality | CC7.2 — Vulnerability management | Security review completed, no CRITICAL/HIGH |
| 5 Quality | CC8.1 — Code review required | Peer review documented |
| 6 Testing | CC7.1 — Testing requirements | Test coverage meets thresholds |
| 7 Documentation | CC2.1 — Communication | System documentation current |
| 8 Deployment | CC7.4 — Change deployment | Release notes with rollback plan |
| 9 Monitoring | CC7.2 — Monitoring & detection | Alerts configured for security events |

### Audit Trail Requirements
- All phase transitions recorded with timestamps
- Gate check results preserved in state.yaml
- Override justifications documented with approver

## HIPAA

HIPAA applies to protected health information (PHI).

### Phase Gates

| Phase | HIPAA Requirement | Check |
|-------|-------------------|-------|
| 1 Requirements | §164.312(a) — Access control | PHI access requirements defined |
| 2 Design | §164.312(e) — Transmission security | Encryption in transit/at rest specified |
| 2 Design | §164.312(b) — Audit controls | Audit logging designed |
| 4 Implementation | §164.312(a) — Unique user identification | User identity implemented |
| 4 Implementation | §164.312(d) — Person authentication | MFA or equivalent implemented |
| 5 Quality | §164.308(a)(8) — Evaluation | Security assessment completed |
| 6 Testing | §164.312(d) — Authentication testing | Auth flow tested end-to-end |
| 8 Deployment | §164.308(a)(7) — Contingency plan | Backup and disaster recovery documented |

## GDPR

GDPR applies to processing of EU personal data.

### Phase Gates

| Phase | GDPR Requirement | Check |
|-------|-----------------|-------|
| 1 Requirements | Art. 25 — Data protection by design | Privacy requirements specified |
| 1 Requirements | Art. 6 — Lawful basis | Legal basis for processing identified |
| 2 Design | Art. 25 — Privacy by default | Minimal data collection designed |
| 2 Design | Art. 35 — DPIA | Data Protection Impact Assessment if high risk |
| 4 Implementation | Art. 17 — Right to erasure | Deletion capability implemented |
| 4 Implementation | Art. 20 — Data portability | Export capability implemented |
| 5 Quality | Art. 32 — Security of processing | Security review of data handling |
| 7 Documentation | Art. 30 — Records of processing | Processing activities documented |

## PCI-DSS

PCI-DSS applies to payment card data.

### Phase Gates

| Phase | PCI-DSS Requirement | Check |
|-------|---------------------|-------|
| 2 Design | Req 1 — Network segmentation | Cardholder data environment isolated |
| 2 Design | Req 3 — Stored data protection | Encryption at rest designed |
| 4 Implementation | Req 6.5 — Secure coding | OWASP Top 10 mitigations implemented |
| 5 Quality | Req 6.6 — Code review | Review of payment-handling code |
| 5 Quality | Req 11.3 — Penetration testing | Security testing of payment flows |
| 6 Testing | Req 11.1 — Testing controls | All security controls tested |
| 8 Deployment | Req 6.4 — Change control | Documented deployment with rollback |

## Framework Selection

Profiles specify applicable frameworks in `compliance.frameworks`. Multiple frameworks can be combined — the union of all gate requirements applies. The compliance-checker agent validates the appropriate gates at each phase transition.
