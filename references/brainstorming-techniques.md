# Brainstorming Techniques Reference

Structured brainstorming techniques for Phase 0 (Discovery) and any ideation-heavy phase. The best ideas usually emerge between idea 50 and 100 — don't stop at the first good one.

## Anti-Bias Protocol

Unstructured brainstorming clusters around the first idea. To prevent this:

1. **Domain shift every 10 ideas** — after 10 ideas in one domain, deliberately shift to a different creative lens (e.g., from technical solutions to user experience to business model)
2. **No evaluation during generation** — capture everything, judge nothing until the session ends
3. **Quantity target before quality filter** — set a target (30+ for small projects, 100+ for complex ones) and don't organize until you hit it
4. **Build on, don't replace** — "Yes, and..." not "No, but..."

## Techniques

### 1. SCAMPER

Apply 7 lenses to an existing solution or problem:

| Lens | Question | Example |
|------|----------|---------|
| **S**ubstitute | What can we replace? | Replace manual review with automated gates |
| **C**ombine | What can we merge? | Combine deployment and monitoring into one phase |
| **A**dapt | What can we borrow from elsewhere? | Adapt airline safety checklists for deployment |
| **M**odify | What can we change in scale/shape? | Make the review process 10x faster |
| **P**ut to other uses | What else could this serve? | Use test artifacts as documentation |
| **E**liminate | What can we remove? | Drop optional phases for simple projects |
| **R**everse | What if we flip the order? | Start with the monitoring dashboard, design backward |

### 2. Reverse Brainstorming

1. Ask: "How could we make this problem **worse**?"
2. Generate 20+ ways to guarantee failure
3. Invert each failure into a solution

Example: "How to guarantee a deployment fails?" → "Deploy on Friday at 5pm with no rollback plan" → Solution: "Deploy Tuesday morning with tested rollback"

### 3. Constraint Removal

1. List all known constraints (budget, timeline, technology, team, regulations)
2. Remove ONE constraint at a time
3. Ask: "If [constraint] didn't exist, what would we build?"
4. Look for ideas that partially survive when the constraint returns

This surfaces solutions you've been unconsciously filtering out.

### 4. Analogous Domains

Pick 3-5 unrelated domains and ask how they solve a similar problem:

| Domain | Their Problem | Their Solution | Our Adaptation |
|--------|--------------|----------------|----------------|
| Restaurants | Managing rush hour | Reservation systems + prep ahead | Pre-compute expensive operations during low-traffic |
| Hospitals | Triage under pressure | Severity classification + protocols | Priority-based error handling |
| Games | Onboarding new players | Progressive tutorial + safe sandbox | Guided setup wizard + starter profile |

The further the domain from your problem, the more creative the solutions.

### 5. Worst Possible Idea

1. Generate 15+ deliberately terrible ideas (no judgment)
2. For each bad idea, ask: "What kernel of insight is in here?"
3. Invert or extract the useful element

Example: "Store all data in a single text file" → Insight: simplicity has value → Solution: "Use SQLite instead of Postgres for small projects"

### 6. Six Thinking Hats

Rotate through 6 structured perspectives:

| Hat | Focus | Time |
|-----|-------|------|
| White | Facts and data only — what do we know? | 3 min |
| Red | Feelings and intuition — what feels right/wrong? | 2 min |
| Black | Caution — what could go wrong? | 3 min |
| Yellow | Benefits — what's the best case? | 3 min |
| Green | Creativity — what else is possible? | 5 min |
| Blue | Process — what have we decided? What's next? | 2 min |

Rotate through all 6 hats for each major idea or decision. The discipline of forced perspective prevents groupthink.

## Session Structure

1. **Warm-up** (5 min): SCAMPER on the problem statement
2. **Generation** (20-30 min): Alternate between techniques, domain-shift every 10 ideas
3. **Clustering** (10 min): Group ideas into themes (don't evaluate yet)
4. **Evaluation** (10 min): Score each cluster on feasibility + impact
5. **Selection** (5 min): Pick top 3-5 ideas for deeper exploration

## Output

After a brainstorming session, capture results in:

```markdown
# Brainstorming Session — {date}

## Technique Used: {technique name}
## Ideas Generated: {count}

### Cluster 1: {theme}
- Idea A (feasibility: H, impact: H) — {description}
- Idea B (feasibility: M, impact: H) — {description}

### Cluster 2: {theme}
...

## Top Candidates
1. {idea} — Selected because: {rationale}
2. {idea} — Selected because: {rationale}
3. {idea} — Selected because: {rationale}
```
