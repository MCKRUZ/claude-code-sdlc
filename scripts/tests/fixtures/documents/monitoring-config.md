# Monitoring Configuration
<!-- Phase 9 — Monitoring | Required artifact -->

## Dashboard Inventory
<!-- REQUIRED: dashboard-inventory — all dashboards listed with URL/location, what they show, a named owner, and review cadence -->

| Dashboard | Location / URL | What It Shows | Owner | Review Cadence |
|-----------|--------------|--------------|-------|---------------|
| System Health | grafana.internal/d/system | CPU, memory, disk per instance | Sam K. | Daily |
| Application Metrics | grafana.internal/d/app | Request rate, error rate, p95 | Priya N. | Continuous |

---

## Metrics Catalog
<!-- REQUIRED: metrics-catalog — system metrics, application RED metrics, business metrics, and dependency metrics all populated with source, unit, and description -->

### System Metrics

| Metric | Source | Unit | Description |
|--------|--------|------|-------------|
| `system.cpu.utilization` | Datadog agent | % | CPU usage per instance |

### Application Metrics (RED Method)

| Metric | Source | Unit | Description |
|--------|--------|------|-------------|
| `app.requests.rate` | APM | req/s | Request throughput |

---

## Coverage Assessment

| P0 Feature / Story | Metric(s) Covering It | Observable? | Gap |
|-------------------|----------------------|------------|-----|
| US-001: Reject duplicate claim | `app.requests.errors` | Yes | |

**Coverage:** 1/1 P0 features observable

---

## Baseline Measurements
<!-- REQUIRED: baseline-measurements — all 6 metrics measured from real production traffic within 48 hours of launch, with measured date and baseline review date -->

| Metric | Baseline Value | Measured At | How to Update |
|--------|--------------|------------|--------------|
| Error rate | 0.3% | 2026-09-12 | Update this doc |
| p95 latency | 210ms | 2026-09-12 | |
| Request rate (peak) | 40 req/s | 2026-09-12 | |
| Request rate (low) | 2 req/s | 2026-09-12 | |
| DB connection pool utilization | 22% | 2026-09-12 | |
| Memory (steady state) | 512 MB | 2026-09-12 | |

**Baseline review date:** 2026-09-14
**Who sets baselines:** Sam K.
