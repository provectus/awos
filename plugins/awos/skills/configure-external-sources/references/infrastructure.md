# Cloud Infrastructure Setup Guides

Known tools and access methods for the cloud account that runs the system. Infrastructure is a knowledge source because the deployed shape of a system — which services exist, which secrets they hold (by name), how a search index or a table is structured — is often documented nowhere else. The manifest records the account and the intent of read-only lookups; the research agent explores from there at spec time.

---

## AWS

**CLI — `aws`**

- Install: `brew install awscli` (macOS), the official installers at https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html (Linux, Windows). Verify with `aws --version`.
- Login, SSO (preferred): `aws configure sso` is interactive — the user runs it as `! aws configure sso` in their terminal, answering with the SSO start URL, region, account, role, and a profile name. Afterwards `aws sso login --profile <name>` opens the browser and returns when done, and is the command to re-run whenever the token expires.
- Login, static keys: `aws configure --profile <name>` prompts for an access key pair. Prefer SSO; keys never go in the repository.
- Profile selection: export `AWS_PROFILE=<name>` in the shell, or pass `--profile <name>` on every call. The profile name is per person and is not recorded in the manifest; the account ID is.
- Verify: `aws sts get-caller-identity --profile <name>` — compare the `Account` field with the manifest. `Error when retrieving token from sso: Token has expired` means re-run `aws sso login`.
- Scope hint: the account ID and alias (`aws iam list-account-aliases`), the default region.
- Usage for research, all read-only: `aws cloudformation list-stacks`, `aws lambda list-functions`, `aws ecs list-services --cluster <c>`, `aws rds describe-db-instances`, `aws opensearch list-domain-names` and `aws opensearch describe-domain --domain-name <d>`, `aws dynamodb list-tables` and `describe-table`, `aws s3 ls`, `aws secretsmanager list-secrets` (names only; fetch a value only when a lookup needs it and never print it), `aws logs describe-log-groups`.
- Index and schema shape: fetch the connection secret by name with `aws secretsmanager get-secret-value`, use it in the same command to query the service (an OpenSearch `_mapping`, a PostgreSQL `\d`), and discard it. Say in the findings which secret was used, not what it held.

**MCP Servers — Vendor-Provided**

- AWS ships several MCP servers at https://github.com/awslabs/mcp (API server, documentation/knowledge server, service-specific servers). The documentation server (`https://knowledge-mcp.global.api.aws`, no credentials) explains AWS services and does not read the account. The API server runs AWS CLI commands over the same profile the CLI uses — it adds nothing when the CLI is already configured.
- Install (knowledge server): `claude mcp add --scope project aws-knowledge -- uvx fastmcp run https://knowledge-mcp.global.api.aws`

**Manual Export Fallback**

- The user pastes resource descriptions or console screenshots when asked.

---

## Google Cloud

**CLI — `gcloud`**

- Install: https://cloud.google.com/sdk/docs/install, then `gcloud init` (interactive, user's terminal).
- Login: `gcloud auth login` opens the browser; `gcloud auth application-default login` for client libraries.
- Verify: `gcloud auth list`, `gcloud config get-value project`.
- Scope hint: the project ID.
- Usage for research: `gcloud run services list`, `gcloud functions list`, `gcloud sql instances list`, `gcloud secrets list`, `gcloud storage ls`.

**Manual Export Fallback**

- Paste resource descriptions when asked.

---

## Azure

**CLI — `az`**

- Install: `brew install azure-cli` (macOS), https://learn.microsoft.com/cli/azure/install-azure-cli otherwise.
- Login: `az login` opens the browser; `az account set --subscription <id>` selects the subscription.
- Verify: `az account show`.
- Scope hint: the subscription ID and resource group.
- Usage for research: `az resource list --resource-group <rg>`, `az webapp list`, `az functionapp list`, `az keyvault secret list --vault-name <v>` (names only).

**Manual Export Fallback**

- Paste resource descriptions when asked.
