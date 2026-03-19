# Azure Enterprise Patterns

Best practices for the microsoft-enterprise profile, aligned with [Microsoft Skills](https://github.com/microsoft/skills) conventions.

## Authentication

### DefaultAzureCredential (Required)
All Azure service connections MUST use `DefaultAzureCredential`. Never hardcode connection strings, keys, or tokens.

```csharp
// C# — correct pattern
var credential = new DefaultAzureCredential();
var client = new SecretClient(new Uri(vaultUri), credential);
```

```typescript
// TypeScript — correct pattern
import { DefaultAzureCredential } from "@azure/identity";
const credential = new DefaultAzureCredential();
```

### Managed Identity
- Production: Use system-assigned Managed Identity on Azure App Service
- Development: Use Azure CLI authentication (`az login`)
- CI/CD: Use service principal with federated credentials (OIDC)

### Entra ID (Azure AD)
- Multi-tenant apps: validate tenant ID in token claims
- Single-tenant: set `ValidateIssuer = true` with specific issuer
- Always validate audience claim matches your app

## Secrets Management

### Azure Key Vault (Required)
- All secrets, connection strings, and certificates MUST be stored in Key Vault
- Use `SecretClient` with `DefaultAzureCredential`
- Never store secrets in appsettings.json, environment variables in production, or source control
- Development: Use .NET User Secrets (`dotnet user-secrets`)

## Monitoring & Observability

### Application Insights
- Enable auto-instrumentation on App Service
- Use `ILogger<T>` for structured logging (maps to App Insights traces)
- Track custom metrics with `TelemetryClient`
- Use correlation IDs for distributed tracing

### Health Checks
```csharp
// Required for Azure App Service deployment slots
builder.Services.AddHealthChecks()
    .AddSqlServer(connectionString)
    .AddAzureBlobStorage(connectionString);
```

## Data Access

### Entity Framework Core
- Always use parameterized queries (EF Core does this by default)
- For raw SQL: `FromSqlInterpolated` only — never `FromSqlRaw` with string concatenation
- Use migrations for schema changes: `dotnet ef migrations add <Name>`
- Enable retry logic for transient failures:
  ```csharp
  options.UseSqlServer(connectionString, sqlOptions =>
      sqlOptions.EnableRetryOnFailure(maxRetryCount: 3));
  ```

## Error Handling

### Global Exception Handler
```csharp
app.UseExceptionHandler("/error");
// Never expose stack traces or internal details in API responses
```

### Result Pattern
Use `Result<T>` for business logic errors — reserve exceptions for truly exceptional cases.

## Security Headers
These MUST be configured on all deployments:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy: default-src 'self'`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`

## Related Microsoft Skills
When building with this profile, consider loading these skills from [microsoft/skills](https://github.com/microsoft/skills):
- `azure-entra-enterprise-dotnet` — Entra ID authentication patterns
- `azure-app-service-dotnet` — App Service deployment and configuration
- `azure-sql-dotnet` — Azure SQL with EF Core patterns
- `azure-key-vault-dotnet` — Secret and certificate management
- `azure-app-insights-dotnet` — Application Insights integration
