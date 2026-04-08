<purpose>
Detect project environment and generate or validate `.planning/DEV-SETUP.md`.
Two modes: generate (create from project detection) and validate (verify service runs locally).
Called standalone via `/gsd:check-env` or automatically at the end of `/gsd:new-project`.
</purpose>

<required_reading>
Read the DEV-SETUP.md template before generating:
@~/.claude/get-shit-done/templates/dev-setup.md
</required_reading>

<process>

## 1. Mode Detection

```
If $ARGUMENTS contains "--generate":
  MODE = "generate"
Else if $ARGUMENTS contains "--validate":
  MODE = "validate"
Else if .planning/DEV-SETUP.md exists:
  MODE = "validate"
Else:
  MODE = "generate"
```

Display banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► CHECK-ENV ({MODE})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If MODE is "validate" → skip to Step 3.

## 2. Generate — Detect Project and Create DEV-SETUP.md

### 2a. Detect Project Type

Scan for project manifest files to determine the tech stack:

| File | Stack | Install | Build | Start |
|------|-------|---------|-------|-------|
| `package.json` | Node.js | `npm install` | `npm run build` | `npm run dev` or `npm start` |
| `pnpm-lock.yaml` | Node.js (pnpm) | `pnpm install` | `pnpm run build` | `pnpm run dev` |
| `yarn.lock` | Node.js (yarn) | `yarn install` | `yarn build` | `yarn dev` |
| `pyproject.toml` | Python | `pip install -e .` | (none) | detect from scripts |
| `requirements.txt` | Python | `pip install -r requirements.txt` | (none) | detect from scripts |
| `Cargo.toml` | Rust | (none) | `cargo build` | `cargo run` |
| `go.mod` | Go | `go mod download` | `go build ./...` | `go run .` |
| `Gemfile` | Ruby | `bundle install` | (none) | detect from scripts |
| `pom.xml` | Java (Maven) | `mvn install` | `mvn package` | `java -jar target/*.jar` |
| `build.gradle` | Java (Gradle) | `gradle build` | `gradle build` | `gradle bootRun` or `java -jar` |
| `docker-compose.yml` | Docker | (none) | `docker compose build` | `docker compose up` |

**For Node.js projects:** Read `package.json` scripts to determine:
- `build` script → use as build command
- `dev` or `start` script → use as start command
- `engines` field → extract version requirements

**For Python projects:** Read `pyproject.toml` `[project.scripts]` or check for common entry points (`manage.py`, `app.py`, `main.py`).

### 2b. Detect Prerequisites

Based on detected stack, build prerequisites list:

```yaml
prerequisites:
  - name: node
    check: "node --version"
    version: ">=18.0.0"  # from engines field or sensible default
```

Also check for common tools:
- `docker` — if docker-compose.yml or Dockerfile exists
- `git` — always present (GSD requires it)

### 2c. Detect Middleware Dependencies

Scan project files for middleware indicators:

| Pattern | Middleware | Check Command |
|---------|-----------|---------------|
| `pg`, `postgres`, `prisma`, `typeorm`, `sequelize`, `sqlalchemy`, `psycopg` | PostgreSQL | `pg_isready -h localhost -p 5432` |
| `mysql`, `mysql2` | MySQL | `mysqladmin ping -h localhost` |
| `mongodb`, `mongoose`, `pymongo` | MongoDB | `mongosh --eval "db.runCommand({ping:1})" --quiet` |
| `redis`, `ioredis`, `bull`, `celery` | Redis | `redis-cli ping` |
| `rabbitmq`, `amqplib`, `pika` | RabbitMQ | `rabbitmqctl status` |
| `kafka`, `kafkajs` | Kafka | `kafka-topics.sh --bootstrap-server localhost:9092 --list` |
| `elasticsearch`, `@elastic` | Elasticsearch | `curl -sf http://localhost:9200/_cluster/health` |
| `minio`, `s3` (with localhost config) | MinIO | `curl -sf http://localhost:9000/minio/health/live` |

**Detection method:**
1. Search dependency files (`package.json` dependencies, `requirements.txt`, `Cargo.toml`, `go.mod`)
2. Search source code imports (top-level `src/`, `app/`, `lib/` directories)
3. Search for docker-compose service definitions
4. Search for `.env.example` or `.env.sample` for connection string patterns

For each detected middleware, also infer:
- `config` — from `.env.example` variable names or common patterns
- `setup` — from docker-compose service definitions, or generate a sensible `docker run` command

### 2d. Detect Verify Endpoint

Look for health check patterns:
1. Search for `/health`, `/healthz`, `/ping`, `/api/health` in route definitions
2. Check docker-compose healthcheck configurations
3. If none found, use the start command's port with a basic connectivity check

### 2e. Present Detection Results

Display what was detected:

```
Detected:
  Stack:         Node.js (pnpm)
  Prerequisites: node >=18.0.0, pnpm >=8.0.0, docker
  Middleware:    PostgreSQL, Redis
  Install:       pnpm install
  Build:         pnpm run build
  Start:         pnpm run dev
  Verify:        curl -sf http://localhost:3000/health
```

Use AskUserQuestion:

- header: "DEV-SETUP"
- question: "Does this look correct? I'll generate .planning/DEV-SETUP.md from this."
- options:
  - "Generate" — Create DEV-SETUP.md with these settings
  - "Adjust" — Let me correct some details first

**If "Adjust":** Ask what to change (freeform), update detection results, re-present.

**If "Generate":** Continue to 2f.

### 2f. Write DEV-SETUP.md

Generate `.planning/DEV-SETUP.md` with:
- YAML frontmatter from detected values
- Markdown body with human-readable documentation for each section

Follow the template structure from `~/.claude/get-shit-done/templates/dev-setup.md`.

Commit:

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs: add local development setup" --files .planning/DEV-SETUP.md
```

Display:

```
✓ Generated .planning/DEV-SETUP.md
```

Then proceed to Step 3 (validate).

## 3. Validate — Verify Service Runs Locally

### 3a. Parse Frontmatter

Read `.planning/DEV-SETUP.md` and extract YAML frontmatter.

If parse fails:
```
❌ DEV-SETUP.md frontmatter is not valid YAML.
  → Fix the YAML syntax in .planning/DEV-SETUP.md
```
Exit.

Check required fields exist: `install`, `build`, `start`, `verify`.

If missing:
```
❌ DEV-SETUP.md missing required field: {field}
  → Add '{field}' to the YAML frontmatter in .planning/DEV-SETUP.md
  → See template: ~/.claude/get-shit-done/templates/dev-setup.md
```
Exit.

### 3b. Check Prerequisites

For each item in `prerequisites[]`:
```bash
{check}  # e.g., node --version
```

If command fails (not found):
```
❌ Prerequisite not met: {name}
  Command: {check}
  Result: command not found
  → Install {name} {version if specified}
```
Exit.

If `version` specified, parse the command output and compare (semver):
```
❌ Prerequisite version mismatch: {name}
  Required: {version}
  Found: {actual_version}
  → Upgrade {name} to {version}
```
Exit.

On success: `✓ Prerequisites: all {count} checks passed`

### 3c. Check Middleware

For each item in `middleware[]`:
```bash
{check}  # e.g., pg_isready -h localhost -p 5432
```

If command fails:
```
❌ Middleware not reachable: {name}
  Command: {check}
  Result: {error output}
  → Start {name}: {setup}
  → Config: {config}
```
Exit.

On success: `✓ Middleware: all {count} services reachable`

### 3d. Run Install

```bash
{install}  # e.g., npm install
```

If exit code non-zero:
```
❌ Install failed
  Command: {install}
  Output (last 20 lines):
  {tail -20 output}
```
Exit.

On success: `✓ Install: dependencies installed`

### 3e. Run Build

```bash
{build}  # e.g., npm run build
```

If exit code non-zero:
```
❌ Build failed
  Command: {build}
  Output (last 20 lines):
  {tail -20 output}
```
Exit.

On success: `✓ Build: compilation successful`

### 3f. Start and Verify

Start service in background:
```bash
{start} &
SERVICE_PID=$!
```

Wait `start_wait` seconds (default 5).

Check process is still running:
```bash
kill -0 $SERVICE_PID 2>/dev/null
```

If process exited:
```
❌ Service exited immediately after start
  Command: {start}
  → Check startup logs for errors
```
Kill process, exit.

Retry `verify.command` with 2-second intervals up to `verify.timeout` seconds (default 30):
```bash
for i in $(seq 1 {retries}); do
  RESULT=$({verify.command} 2>&1)
  if [[ $? -eq 0 ]]; then
    if [[ -z "{verify.expected}" ]] || echo "$RESULT" | grep -q "{verify.expected}"; then
      VERIFIED=true
      break
    fi
  fi
  sleep 2
done
```

If not verified:
```
❌ Service verification failed
  Command: {verify.command}
  Expected: {verify.expected or "exit code 0"}
  Last result: {RESULT}
  → Check that the service starts correctly on the expected port
  → Review .planning/DEV-SETUP.md start and verify fields
```

Kill background service:
```bash
kill $SERVICE_PID 2>/dev/null
wait $SERVICE_PID 2>/dev/null
```

Exit if not verified.

### 3g. Success

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► CHECK-ENV PASSED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 ✓ Prerequisites:  {count} checks passed
 ✓ Middleware:     {count} services reachable
 ✓ Install:        dependencies installed
 ✓ Build:          compilation successful
 ✓ Service:        verified running locally

 Service is ready for BDD workflows.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

</process>

<success_criteria>
- [ ] Mode correctly detected (generate vs validate)
- [ ] Project type detected from manifest files
- [ ] Prerequisites detected from stack and engines
- [ ] Middleware detected from dependencies and source code
- [ ] DEV-SETUP.md generated with correct frontmatter and body
- [ ] Frontmatter parsed and required fields validated
- [ ] Prerequisites checked (presence + version)
- [ ] Middleware connectivity verified
- [ ] Install command succeeds
- [ ] Build command succeeds
- [ ] Service starts and verify command passes
- [ ] Background service process cleaned up after validation
</success_criteria>
