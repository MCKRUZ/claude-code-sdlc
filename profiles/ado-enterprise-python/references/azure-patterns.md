# Azure Enterprise Patterns

Best practices for the ado-enterprise-python profile, aligned with [Microsoft Skills](https://github.com/microsoft/skills) conventions.

## Authentication

### DefaultAzureCredential (Required)
All Azure service connections MUST use `DefaultAzureCredential`. Never hardcode connection strings, keys, or tokens.

```python
# Python — correct pattern (azure-identity + azure-keyvault-secrets)
from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient

credential = DefaultAzureCredential()
client = SecretClient(vault_url=vault_uri, credential=credential)
```

```typescript
// React frontend — user sign-in goes through MSAL, not DefaultAzureCredential
// (@azure/identity is server-side only; the SPA authenticates users via Entra ID)
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
const msalInstance = new PublicClientApplication({ auth: { clientId, authority } });
```

### Managed Identity
- Production: Use system-assigned Managed Identity on Azure Container Apps
- Development: Use Azure CLI authentication (`az login`)
- CI/CD: Use service principal with federated credentials (OIDC)

### Entra ID (Azure AD)
- Multi-tenant apps: validate tenant ID in token claims
- Single-tenant: validate the issuer against the specific tenant issuer URL
- Always validate audience claim matches your app

## Secrets Management

### Azure Key Vault (Required)
- All secrets, connection strings, and certificates MUST be stored in Key Vault
- Use `SecretClient` with `DefaultAzureCredential`
- Never store secrets in config files, environment variables in production, or source control
- Development: use a gitignored `.env` file, or read Key Vault directly via `az login` + `DefaultAzureCredential`

## Monitoring & Observability

### Application Insights
- Instrument with OpenTelemetry: `azure-monitor-opentelemetry` (`configure_azure_monitor()`) auto-instruments FastAPI, SQLAlchemy, and outbound HTTP
- Use `logging.getLogger(__name__)` for structured logging (records flow to App Insights traces via the OTel handler)
- Track custom metrics through the OpenTelemetry metrics API
- Use correlation IDs for distributed tracing (W3C trace context is propagated automatically)

### Health Checks
```python
# Required for Container Apps liveness/readiness probes
from fastapi import FastAPI
from sqlalchemy import text

app = FastAPI()

@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness + dependency check; probe target for Container Apps."""
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {"status": "ok"}
```

## Data Access

### SQLAlchemy 2.0 + Alembic
- Always use parameterized queries (SQLAlchemy binds parameters by default)
- For raw SQL: `text()` with bound parameters only — never f-strings or `%` interpolation into SQL
- Use Alembic for schema changes: `alembic revision --autogenerate -m "<description>"`, then review the generated migration before committing
- Enable retry/liveness handling for transient failures:
  ```python
  engine = create_async_engine(
      database_url,
      pool_pre_ping=True,   # detect stale connections before use
      pool_recycle=300,     # recycle connections past the platform idle timeout
  )
  ```

## Error Handling

### Global Exception Handler
```python
# Never expose stack traces or internal details in API responses
@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.public_message})
```

### Domain Exceptions
Raise domain-specific exceptions derived from one project base class (`DomainError`) — reserve bare exceptions for truly exceptional cases, and let unexpected errors propagate to the global handler.

## Security Headers
These MUST be configured on all deployments:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy: default-src 'self'`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`

## Related Microsoft Skills
When building with this profile, consider loading these skills from [microsoft/skills](https://github.com/microsoft/skills):
- `azure-identity-py` — DefaultAzureCredential and Entra ID authentication patterns
- `azure-keyvault-py` — Secret and certificate management
- `azure-monitor-opentelemetry-py` — Application Insights via OpenTelemetry
- `azure-containerregistry-py` — Container Registry integration
- `fastapi-router-py` — FastAPI router and endpoint patterns
- `pydantic-models-py` — Pydantic model design at the API boundary
