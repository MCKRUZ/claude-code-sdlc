# Monitoring Configuration
<!-- Phase 9 — Monitoring | Required artifact -->

## Dashboard Inventory
<!-- REQUIRED: dashboard-inventory — all dashboards listed with URL/location, what they show, a named owner, and review cadence -->

Every dashboard has an owner who reviews it. A dashboard no one watches is noise.

| Dashboard | Location / URL | What It Shows | Owner | Review Cadence |
|-----------|--------------|--------------|-------|---------------|
| [System Health] | [URL / tool] | CPU, memory, disk, network per instance | [Name] | Daily |
| [Application Metrics] | [URL] | Request rate, error rate, p95 latency (RED) | [Name] | Continuous |
| [Business Metrics] | [URL] | [Active users / transactions / key business events] | [Name] | Daily |
| [Dependency Health] | [URL] | DB connections, external API health | [Name] | Continuous |

---

## Metrics Catalog
<!-- REQUIRED: metrics-catalog — system metrics, application RED metrics, business metrics, and dependency metrics all populated with source, unit, and description -->

Every metric being collected, its source, and its meaning.

### System Metrics

| Metric | Source | Unit | Description |
|--------|--------|------|-------------|
| `system.cpu.utilization` | [Agent / infra] | % | CPU usage per instance |
| `system.memory.used` | [Agent / infra] | MB | Resident memory per instance |
| `system.disk.utilization` | [Agent / infra] | % | Disk usage per volume |
| `system.network.bytes_in` | [Agent / infra] | bytes/s | Inbound network traffic |

### Application Metrics (RED Method)

| Metric | Source | Unit | Description |
|--------|--------|------|-------------|
| `app.requests.rate` | [APM / instrumentation] | req/s | Request throughput |
| `app.requests.errors` | [APM] | count/s | Error count (4xx/5xx) |
| `app.requests.duration_p95` | [APM] | ms | 95th percentile response time |
| `app.requests.duration_p99` | [APM] | ms | 99th percentile response time |

### Business Metrics

| Metric | Source | Unit | Description | Stakeholder |
|--------|--------|------|-------------|------------|
| `business.[metric]` | [Source] | [Unit] | [What it measures] | [Who cares] |

### Dependency Metrics

| Dependency | Metric | Source | What It Indicates |
|-----------|--------|--------|------------------|
| [Database] | Connection pool utilization | [Driver / APM] | Connection exhaustion risk |
| [External API] | Error rate | [APM / wrapper] | Third-party degradation |

---

## Coverage Assessment

Are all P0 features observable?

| P0 Feature / Story | Metric(s) Covering It | Observable? | Gap |
|-------------------|----------------------|------------|-----|
| US-001: [Story] | `[metric name]` | ✅ Yes | |
| US-002: [Story] | `[metric name]` | ✅ Yes | |
| [P0 feature] | — | ❌ No | [What metric would cover it] |

**Coverage:** [N/N] P0 features observable

---

## Baseline Measurements
<!-- REQUIRED: baseline-measurements — all 6 metrics measured from real production traffic within 48 hours of launch, with measured date and baseline review date -->

Establish within 48 hours of production launch by observing normal traffic.

| Metric | Baseline Value | Measured At | How to Update |
|--------|--------------|------------|--------------|
| Error rate | [X]% | [YYYY-MM-DD] | Update this doc; adjust alert thresholds |
| p95 latency | [X]ms | [YYYY-MM-DD] | |
| Request rate (peak) | [X] req/s | [YYYY-MM-DD] | |
| Request rate (low) | [X] req/s | [YYYY-MM-DD] | |
| DB connection pool utilization | [X]% | [YYYY-MM-DD] | |
| Memory (steady state) | [X] MB | [YYYY-MM-DD] | |

**Baseline review date:** [YYYY-MM-DD + 48h from launch]
**Who sets baselines:** [Name]
