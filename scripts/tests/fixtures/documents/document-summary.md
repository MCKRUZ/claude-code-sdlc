---
doc_id: "DOC-003"
filename: "adjuster-network-sla.pdf"
type: "PDF"
source_path: "docs/client-intake/adjuster-network-sla.pdf"
estimated_tokens: 13000
created: "2026-10-09T13:05:00Z"
---
<!-- TARGET: 800 tokens. Prioritize: Overview > Extractable Requirements > Key Terms > Relevance. -->

# DOC-003: adjuster-network-sla.pdf

## Document Overview
The service level agreement between Acme Insurance and its contracted adjuster network. It sets how quickly an adjuster must respond to an assigned claim, how performance is measured each month, and the penalties that apply when the network misses its targets.

## Key Information
- **Purpose:** Defines the response-time and quality commitments the adjuster network owes Acme
- **Audience:** Acme claims operations managers and the adjuster network's account leads
- **Scope:** Residential and commercial property claims handled by contracted adjusters

## Extractable Requirements
<!-- List requirements or constraints found in this document that should inform Phase 1. -->
- An adjuster must respond within 48 hours of assignment (s3.2)
- Response time is measured monthly and reported by the 5th business day (s4.1)
- Missing the response target on more than 10 percent of claims in a month triggers a service credit (s5.3)

## Key Terms & Definitions
<!-- Domain terms defined in this document that the project should use consistently. -->
| Term | Definition |
|------|-----------|
| Assignment | The moment a claim is allocated to a named adjuster in the claims system |
| Response | The first documented contact by the adjuster with the policyholder |
| Service credit | A reduction in the network's monthly invoice applied for a missed target |

## Relevance to Project
The portal's assignment and status features must honor the 48-hour response commitment, and its reporting must produce the monthly response-time figures this agreement requires.
