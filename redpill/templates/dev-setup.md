# DEV-SETUP.md Template

<purpose>
Defines the structure and schema for `.planning/DEV-SETUP.md` — a machine-parseable + human-readable document that describes how to compile, build, and run a project's service locally. Used as a gate check before BDD workflows: if this file is missing or the service cannot be verified locally, BDD does not proceed.
</purpose>

<when_to_create>
- Before running any BDD phase (`/gsd:bdd-phase`)
- When setting up a new project with `/gsd:new-project`
- When onboarding a new developer to a project
</when_to_create>

<schema>
The file uses YAML frontmatter for machine-parseable fields and Markdown body for human-readable documentation. The gate check parses the frontmatter and executes commands sequentially.

## Frontmatter Fields

```yaml
---
# Required: Runtime and tool dependencies
prerequisites:
  - name: string              # Tool/runtime name (e.g., "node", "python3", "docker")
    check: string             # Command to detect presence (e.g., "node --version")
    version: string           # Optional: expected version, semver format (e.g., ">=18.0.0")

# Optional: External services the project depends on
middleware:
  - name: string              # Service name (e.g., "PostgreSQL", "Redis", "RabbitMQ")
    check: string             # Connectivity check command (e.g., "pg_isready -h localhost -p 5432")
    config: string            # How to configure access (e.g., "DATABASE_URL in .env")
    setup: string             # Optional: command to start locally (e.g., "docker run ...")

# Required: Dependency installation command
install: string               # e.g., "npm install", "pip install -r requirements.txt"

# Required: Build/compile command
build: string                 # e.g., "npm run build", "cargo build"

# Required: Service start command (will be run in background)
start: string                 # e.g., "npm run dev", "python manage.py runserver"

# Optional: Seconds to wait after start before verifying (default: 5)
start_wait: number

# Required: How to verify the service is running
verify:
  command: string             # e.g., "curl -sf http://localhost:3000/health"
  expected: string            # Optional: expected substring in output (e.g., "ok")
  timeout: number             # Optional: max seconds to wait (default: 30)
---
```

## Markdown Body

The body provides human-readable documentation. Use these sections:

```markdown
# Local Development Setup

## Prerequisites
List runtime/tool requirements with install instructions.

## Middleware
For each middleware dependency:
- What it is and why it's needed
- How to start it locally (Docker preferred)
- How to configure access (env vars, config files)

## Install & Build
Step-by-step install and build instructions.

## Run
How to start the service locally.

## Verify
How to confirm the service is running correctly.
```
</schema>

<example>
```markdown
---
prerequisites:
  - name: node
    check: "node --version"
    version: ">=18.0.0"
  - name: pnpm
    check: "pnpm --version"
    version: ">=8.0.0"
  - name: docker
    check: "docker --version"

middleware:
  - name: PostgreSQL
    check: "pg_isready -h localhost -p 5432"
    config: "DATABASE_URL in .env, format: postgresql://user:pass@localhost:5432/dbname"
    setup: "docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16"
  - name: Redis
    check: "redis-cli ping"
    config: "REDIS_URL in .env, default: redis://localhost:6379"
    setup: "docker run -d --name redis -p 6379:6379 redis:7"

install: "pnpm install"
build: "pnpm run build"
start: "pnpm run dev"
start_wait: 8

verify:
  command: "curl -sf http://localhost:3000/health"
  expected: "ok"
  timeout: 30
---

# Local Development Setup

## Prerequisites
- Node.js >= 18.0.0 — [Download](https://nodejs.org/)
- pnpm >= 8.0.0 — `npm install -g pnpm`
- Docker — [Download](https://www.docker.com/products/docker-desktop/)

## Middleware

### PostgreSQL
Primary data store. Start with Docker:
\```bash
docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16
\```
Add to `.env`:
\```
DATABASE_URL=postgresql://postgres:dev@localhost:5432/myapp
\```

### Redis
Used for caching and session storage. Start with Docker:
\```bash
docker run -d --name redis -p 6379:6379 redis:7
\```
Add to `.env`:
\```
REDIS_URL=redis://localhost:6379
\```

## Install & Build
\```bash
pnpm install
pnpm run build
\```

## Run
\```bash
pnpm run dev
\```
Server starts on http://localhost:3000.

## Verify
\```bash
curl -sf http://localhost:3000/health
\```
Should return `ok`.
```
</example>

<gate_check_algorithm>
The BDD pre-flight gate check parses this file and executes validation in order:

```
1. FILE EXISTS?
   .planning/DEV-SETUP.md must exist
   → Fail: suggest creating from template

2. FRONTMATTER PARSEABLE?
   YAML frontmatter must parse without errors
   → Fail: show parse error, suggest fixing syntax

3. PREREQUISITES
   For each item in prerequisites[]:
     Run: {check}
     If version specified: compare output against {version}
   → Fail: report which prerequisite missing/wrong version

4. MIDDLEWARE
   For each item in middleware[]:
     Run: {check}
     If fails and {setup} exists: suggest running {setup}
   → Fail: report which middleware unreachable + config hint

5. INSTALL
   Run: {install}
   → Fail: report install error output

6. BUILD
   Run: {build}
   → Fail: report build error output

7. START (background)
   Run: {start} &
   Wait: {start_wait} seconds (default 5)
   → Fail: report if process exits immediately

8. VERIFY
   Retry {command} up to {timeout} seconds:
     If {expected}: check output contains {expected}
     Else: check exit code 0
   → Fail: report verify failure + last output

9. CLEANUP
   Kill background service process started in step 7
```
</gate_check_algorithm>
