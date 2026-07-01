// =============================================================================
// Client DEV environment — minimal STARTER (delivery standard, Phase 3)
// =============================================================================
// This is a deliberately small dev-only starter: an app host, a Key Vault the
// app reads via a managed identity, and the identity itself. It is the seed for
// a client engagement's dev environment — NOT a production template. Test and
// prod environments are added at the hardening stage (see README), with their
// own parameter files and tighter policy.
//
// HONESTY RULES (do not break when adapting):
//   - Nothing client-specific is hardcoded. Every name, location, and id is a
//     parameter or a deterministic expression. No fake resource names, no
//     secrets in this file.
//   - Secrets live in Key Vault and are referenced; they are never authored here.
//   - IaC is HIGH risk EVERY time it changes. This file is an input to the
//     pipeline in README.md (validate -> policy gate -> what-if -> cost ->
//     human approval -> scoped apply -> drift check), not an apply-on-save.
//
// Scope: resource group. Deploy into an existing, pre-provisioned dev RG so the
// blast radius is contained and RG-level RBAC bounds the apply.
// =============================================================================

targetScope = 'resourceGroup'

// ----------------------------------------------------------------------------
// Parameters — everything client-specific enters here.
// ----------------------------------------------------------------------------
@description('Short workload/app name. Used to derive resource names. Lowercase, 2-12 chars.')
@minLength(2)
@maxLength(12)
param workloadName string

@description('Environment moniker. This starter targets dev only.')
@allowed([
  'dev'
])
param environment string = 'dev'

@description('Azure region for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Tags REQUIRED by the policy-as-code gate (see infra/policy). All four must be non-empty.')
param requiredTags object = {
  workload: workloadName
  environment: environment
  owner: '' // <PLACEHOLDER> set to the owning team/email at deploy time
  costCenter: '' // <PLACEHOLDER> set to the client cost center at deploy time
}

@description('Azure AD object IDs granted Key Vault Secrets User on the vault (e.g. the dev team group). Empty by default — grant explicitly.')
param keyVaultReaderPrincipalIds array = []

// ----------------------------------------------------------------------------
// Naming — derived, not authored. Suffix keeps names globally unique.
// ----------------------------------------------------------------------------
var namePrefix = '${workloadName}-${environment}'
var uniqueSuffix = uniqueString(resourceGroup().id, workloadName, environment)
// Key Vault & storage-style names: no dashes, length-limited, globally unique.
var keyVaultName = take('kv${replace(workloadName, '-', '')}${uniqueSuffix}', 24)

// Built-in role: Key Vault Secrets User (read secret values).
var keyVaultSecretsUserRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4633458b-17de-408a-b874-0445c86b69e6'
)

// ----------------------------------------------------------------------------
// User-assigned managed identity — the app's identity, no stored credentials.
// ----------------------------------------------------------------------------
resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-id'
  location: location
  tags: requiredTags
}

// ----------------------------------------------------------------------------
// Key Vault — RBAC-authorized, no public network exposure, soft-delete on.
// The app reads secrets from here via appIdentity; secrets are NOT authored here.
// ----------------------------------------------------------------------------
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: requiredTags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true // RBAC, not access policies — least privilege via roles
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Disabled' // policy gate: no public data plane
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
    }
  }
}

// Grant the app identity read access to secrets (scoped to THIS vault only).
resource appIdentitySecretsRead 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, appIdentity.id, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultSecretsUserRoleId
  }
}

// Grant any additional reader principals (dev team group, etc.) the same role.
resource extraSecretsReaders 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for principalId in keyVaultReaderPrincipalIds: {
    name: guid(keyVault.id, principalId, keyVaultSecretsUserRoleId)
    scope: keyVault
    properties: {
      principalId: principalId
      roleDefinitionId: keyVaultSecretsUserRoleId
    }
  }
]

// ----------------------------------------------------------------------------
// App host — minimal Linux App Service. Stand-in for "the app runs somewhere";
// swap for Container Apps / Functions per the engagement. HTTPS-only, TLS 1.2+,
// uses the user-assigned identity so it can pull config from Key Vault.
// ----------------------------------------------------------------------------
resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${namePrefix}-plan'
  location: location
  tags: requiredTags
  sku: {
    name: 'B1' // smallest paid dev tier; right-size per engagement
    tier: 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true // required for Linux
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: '${namePrefix}-app'
  location: location
  tags: requiredTags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${appIdentity.id}': {}
    }
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    keyVaultReferenceIdentity: appIdentity.id // resolve KV references via this identity
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      // App settings use Key Vault references — the value resolves at runtime,
      // the secret is never present in source or in the ARM payload.
      // Example (uncomment and point at a real secret you have created):
      // appSettings: [
      //   {
      //     name: 'ExampleSecret'
      //     value: '@Microsoft.KeyVault(SecretUri=${keyVault.properties.vaultUri}secrets/<secret-name>)'
      //   }
      // ]
    }
  }
}

// ----------------------------------------------------------------------------
// Outputs — ids/uris only, never secret values.
// ----------------------------------------------------------------------------
output appIdentityClientId string = appIdentity.properties.clientId
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output webAppName string = webApp.name
output webAppDefaultHostName string = webApp.properties.defaultHostName
