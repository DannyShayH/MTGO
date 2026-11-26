---
title: Staging deployment
description: Hosting plan, release flow, server setup and the runbook for the staging environment on the DigitalOcean Droplet.
---

Every normal TakT delivery to `main` can end with the delivered commit running
on one staging environment: the Medusa backend with its admin, the Next.js
storefront and the Next.js partner app, with Redis, on a DigitalOcean Droplet.
It reuses the Caddy reverse proxy and the PostgreSQL 16 container that already
run there. It is a school project: the data is synthetic, payments are mocked
and there is no production environment.

**Status:** prepared in the repository, not activated. The staging jobs stay
skipped until the repository admin sets `STAGING_DEPLOY_ENABLED=true`.

**Public URLs:** filled in by the repository admin after activation. Until then
the hostnames below are the placeholders from `deploy/staging/.env.template`.

| Service               | URL                                   | Notes                                                            |
| --------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| Storefront            | `https://staging.example.org`         | Customer ordering with synthetic Restaurants and menus           |
| Backend API and Admin | `https://api.staging.example.org`     | Admin dashboard at `/app`, only for authenticated administrators |
| Partner app           | `https://partner.staging.example.org` | Restaurant staff sign-in                                         |

Use made-up names, addresses and emails on staging. Never enter real personal
or payment details.

## Hosting plan and cost

| Item               | Decision                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host               | One DigitalOcean Droplet, Ubuntu 22.04, 2 GB RAM, 2 GB swap, Docker 29 and Docker Compose 5, owned by the repository admin                                                   |
| Recurring cost     | The Droplet and domain, plus Tigris storage and request charges under the selected account plan                                                                              |
| Domain and DNS     | Three `A` (or `AAAA`) records for the storefront, API and partner hostnames pointing at the Droplet; Caddy obtains the certificates                                          |
| Reverse proxy      | The existing Caddy. The repository ships no proxy; `deploy/staging/Caddyfile.example` has the three site blocks                                                              |
| Database           | The existing PostgreSQL 16 container `db`: a separate `mtogo_staging` database owned by the restricted role `mtogo_staging_app`                                              |
| Runtime            | `deploy/staging/compose.yaml`: pinned `redis:7.4.12`, client-only `postgres:16.16`, and release images built from `node:24.22.3-bookworm-slim`                               |
| Images             | GitHub Container Registry: `ghcr.io/<owner>/mtgo-staging-backend`, `-partner` and `-storefront`, tagged with the commit SHA                                                  |
| Persistence        | Staging data lives in PostgreSQL. New photos live in the private Tigris `mtogo` bucket; the legacy `backend-static` volume remains mounted                                   |
| Private networking | Redis sits on an internal network without published ports. The backend reaches `db` over its existing Docker network. Only the three app ports are published, on `127.0.0.1` |
| Credentials        | GitHub repository secrets for SSH; `/srv/mtogo-staging/.env` on the Droplet for runtime secrets. Nothing in Git, images or docs                                              |

### Memory on a 2 GB Droplet

Reusing PostgreSQL removes the largest staging container. The backend runs in
Medusa's **shared worker mode** by default: one process serves HTTP and runs
subscribers, scheduled jobs and workflows. Every container has a memory cap
and the Node heaps are limited:

| Container  | Memory cap | Node heap                 |
| ---------- | ---------- | ------------------------- |
| backend    | 768 MB     | `BACKEND_HEAP_MB`, 512 MB |
| storefront | 384 MB     | 256 MB                    |
| partner    | 288 MB     | 192 MB                    |
| redis      | 96 MB      | 64 MB data limit          |

These are ceilings, not typical use; swap absorbs peaks next to the existing
stack. Medusa recommends a separate worker in production. With more memory,
set `STAGING_SPLIT_WORKER=true`: the next deploy runs the backend in `server`
mode and starts a `worker` container (cap 512 MB). If the backend is killed for
memory (`dmesg | grep -i kill`), lower `BACKEND_HEAP_MB` before resizing.

The optional [request monitoring](/MTGO/quality/staging-request-monitoring/)
adds Prometheus (cap 192 MB), Grafana (cap 448 MB) and Node Exporter (cap
48 MB) as a separate Compose project, with its own memory readings and floor.

### Decisions recorded for issue #35

- **Repository secrets, not a protected GitHub Environment.** The SSH
  credentials are plain repository secrets (`STAGING_SSH_HOST`,
  `STAGING_SSH_USER`, `STAGING_SSH_KEY`, `STAGING_SSH_KNOWN_HOSTS`). A protected
  environment with required reviewers would add a manual approval to every
  delivery, which contradicts the TakT flow. Deployment is switched on and off
  with one repository variable, and the SSH key itself can do only four things
  (see [SSH access](#ssh-access-for-the-deploy-workflow)).
- **The existing Caddy and the existing PostgreSQL container are reused.** The
  existing Compose stack is never changed: staging only attaches to the
  database's Docker network and uses its own database and role.
- **Images are built in GitHub Actions**, never on the Droplet: the Next.js and
  admin builds need more memory than the Droplet has.
- **The storefront is built after the backend of the same release is running.**
  Next.js inlines the public values (backend URL, site URL, default region,
  publishable key) at build time and prerenders the sitemap from the backend.
  The deploy script answers the first phase with those values, read from
  `.env` and from the publishable key that the initial data seed created in
  the staging database. That removes the bootstrap problem of a key that only
  exists after the first migration.
- **Root owns `/srv/mtogo-staging`.** The deploy script runs as root and
  executes the Compose files it finds there; a directory writable by the
  deploy user would let that user run any container as root.
- **Synthetic seeds** (`seed-demo-restaurant`, `seed-demo-menu`) run only
  against a database named `mtogo_staging…`, local development or a
  `medusa_ci_` database. The name declares the database synthetic.

## Release flow

The Deploy workflow (`.github/workflows/on_main.yml`) runs on every push to
`main`. The docs job downloads the Ready artifact named for the delivered
commit and uploads a Pages artifact named for the run and attempt. It tries
Pages deployment up to three times, waiting 15 and then 30 seconds between
attempts to allow artifact visibility to catch up. The final result sets the
`deploy:pages` commit status. If deployment still fails, inspect the download,
upload and deploy step logs. Rerun the failed job after correcting the cause;
the new attempt uploads a distinct artifact and does not collide with earlier
attempts. If the tested artifact is missing or expired, rerun Ready for the
commit before retrying deployment. Two more jobs
run only while the repository variable `STAGING_DEPLOY_ENABLED` is `true`:

1. **release_images** builds the `backend` and `partner` targets of
   `deploy/staging/Dockerfile` and pushes them to GHCR tagged with the commit
   SHA. The backend image also carries the Compose file of that commit.
2. **deploy_staging** (serialized by the `staging-droplet` concurrency group;
   normal runs are not cancelled automatically):
   1. Checks the SHA is on `main` and configures SSH from the four secrets.
   2. `ssh staging prepare <sha>`: pulls the two images, extracts the Compose
      file into `/srv/mtogo-staging/releases/<sha>/`, starts Redis, waits
      until `db` answers, **dumps the staging database**, runs the
      migrations (including the initial data seed on the first run), starts
      the backend and the partner app, waits for their health checks and
      prints the storefront build values.
   3. Verifies over HTTPS that the backend answers `/store/regions` with that
      publishable key.
   4. Builds and pushes the `storefront` image with those values.
   5. `ssh staging release <sha>`: pulls the storefront image, starts it,
      waits for its health check, records `releases/current` and
      `releases/previous` and removes older images.
   6. Smoke check: the public storefront page `/dk/store` renders.

The job summary shows the release SHA, the container table and the smoke check
result. A failed step fails the Deploy run: a red Deploy run on `main` means
staging does **not** run that commit. The docs job's result is independent.
The migration uses `--execute-safe-links`: Medusa applies safe link changes
without prompting CI to delete or update old link tables. Removed tables remain
until their data has been reviewed and an administrator deliberately removes
them. In particular, the old category-to-product link table from #112 is kept.

The short-lived `GITHUB_TOKEN` is passed on stdin for one `docker login` in a
temporary Docker config, which the deploy script deletes on exit. If the three
GHCR packages are public, no login is needed.

A brief maintenance window exists between the backend start in step 2 and the
storefront start in step 5 (a few minutes): the previous storefront keeps
serving against the new backend. Zero downtime is out of scope.

### Retry and redeploy

- **Retry a failed run:** re-run the failed jobs from the Actions page.
- **Recover a run waiting at a link deletion prompt:** inspect the migration
  container log on the Droplet to confirm the cause. Cancel a newer pending
  Deploy run first, then cancel the stuck run so the newer run cannot repeat
  the same prompt. Check that the migration container has stopped; if it is
  still running, stop that container before starting another deploy. Do not
  select table deletion or rerun the old commit. Deliver the non-interactive
  migration fix on a new issue branch, then let the new `main` commit deploy.
  That commit includes all preceding changes on `main`. Confirm the Deploy
  smoke check passes and `sudo mtogo-deploy.sh status` reports the new commit
  as the current release. If cancellation does not finish, use GitHub's
  force-cancel action for the stuck run before deploying again.
- **Redeploy an already built release** (for example after a Droplet reboot
  or to move back to a known-good commit): run the Deploy workflow manually
  with `release_sha` set to the full commit SHA. The images must exist in GHCR
  or on the Droplet; the job then runs `deploy <sha>`, which repeats the backup
  and the (idempotent) migrations and starts every service.
- **Pause deployment:** set `STAGING_DEPLOY_ENABLED` to anything but `true`.
  Deliveries continue; only the staging jobs are skipped.

## Server setup (repository admin)

The repository never connects to the Droplet except through the Deploy
workflow, and only after activation. These steps are done by hand. Commands
run as an administrator account with sudo, not as the deploy user.

### 1. Root ownership of the staging directory

The directory is currently `deploy:deploy`, mode `750`. Look at its contents
first, then hand it to root:

```bash
sudo ls -la /srv/mtogo-staging
sudo chown -R root:root /srv/mtogo-staging
sudo chmod 700 /srv/mtogo-staging
```

The deploy script refuses to run while the directory is owned by anyone else
or writable by group or others. The deploy user needs no access to it.

### 2. Database, role and network

Find the existing container's network and superuser (the `POSTGRES_USER` of
the existing stack, often `postgres`):

```bash
docker inspect db --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
docker exec db sh -c 'echo "$POSTGRES_USER"'
```

Create the restricted role and the staging database. `\password` asks for the
password interactively, so it stays out of shell history. Use letters and
digits only (`openssl rand -hex 24`):

```bash
docker exec -it db psql -U <superuser> -d postgres
```

```sql
CREATE ROLE mtogo_staging_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20;
\password mtogo_staging_app
CREATE DATABASE mtogo_staging OWNER mtogo_staging_app
  ENCODING 'UTF8' TEMPLATE template0;
REVOKE ALL ON DATABASE mtogo_staging FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE mtogo_staging TO mtogo_staging_app;
\connect mtogo_staging
-- Medusa's product search needs both; the superuser creates them once.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
\q
```

The role owns only `mtogo_staging`, cannot create databases or roles and has
at most 20 connections. PostgreSQL lets every role connect to a database
whose `CONNECT` privilege is still granted to `PUBLIC`, which is the default.
To keep the staging role out of the existing databases as well, revoke that
default on each of them (this changes the existing databases' grants; check
which roles use them first):

```sql
REVOKE CONNECT ON DATABASE <existing_db> FROM PUBLIC;
GRANT CONNECT ON DATABASE <existing_db> TO <existing_role>;
```

Check that the staging role can log in over the network, as the containers
will (it asks for the password):

```bash
docker run --rm -it --network <db network> postgres:16.16-bookworm \
  psql "host=db dbname=mtogo_staging user=mtogo_staging_app sslmode=disable" -c 'select current_user'
```

The staging containers attach to that network. Staging never changes it, but
while they are attached, `docker compose down` of the existing stack cannot
remove the network; stop staging first (`sudo mtogo-deploy.sh compose down`).

### 3. Runtime configuration

Copy `deploy/staging/.env.template` to `/srv/mtogo-staging/.env` and fill in
the three public URLs, the image prefix (`ghcr.io/<owner lower case>/mtgo-staging`),
`STAGING_DB_NETWORK` from step 2, the database password, and `JWT_SECRET` and
`COOKIE_SECRET` from `openssl rand -hex 32`. Add `RESEND_API_KEY` so new
Customers receive their verification email; without it the backend only logs
the email. `RESEND_FROM_EMAIL` is optional and defaults to
`MTogo <noreply@corral.dk>`. `ORS_API_KEY`, an openrouteservice free Standard
key, is optional too: without it the Delivery agent workspace shows "Distance
unavailable":

```bash
sudo install -o root -g root -m 600 /dev/null /srv/mtogo-staging/.env
sudoedit /srv/mtogo-staging/.env
```

### 4. Scripts

Install both scripts from the repository, replacing the placeholder. Re-install
them whenever they change in the repository: the workflow never copies them,
so the Droplet runs only scripts the admin has read. Fetch them at the commit
you reviewed, read them, then install:

Work in a scratch folder in your home directory, not in `/srv/mtogo-staging`.
`curl -O` saves each file there under its own name.

```bash
mkdir -p ~/mtogo-scripts && cd ~/mtogo-scripts
sha=<the commit you reviewed>
curl -fsSLO "https://raw.githubusercontent.com/DannyShayH/MTGO/$sha/deploy/staging/mtogo-deploy.sh"
curl -fsSLO "https://raw.githubusercontent.com/DannyShayH/MTGO/$sha/deploy/staging/mtogo-deploy-ssh.sh"
curl -fsSLO "https://raw.githubusercontent.com/DannyShayH/MTGO/$sha/deploy/staging/sudoers.example"
less mtogo-deploy.sh mtogo-deploy-ssh.sh sudoers.example
sudo install -o root -g root -m 755 mtogo-deploy.sh /usr/local/sbin/mtogo-deploy.sh
sudo install -o root -g root -m 755 mtogo-deploy-ssh.sh /usr/local/sbin/mtogo-deploy-ssh
sudo mtogo-deploy.sh help
```

A deploy updates images and the release's Compose file, never these scripts.
When only `mtogo-deploy.sh` changed, install just that one.

### SSH access for the deploy workflow

Three pieces together give the GitHub Actions key exactly four operations and
nothing else:

| Piece                                             | Runs as | Allows                                                                                                                                                                                  |
| ------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forced command `/usr/local/sbin/mtogo-deploy-ssh` | deploy  | No shell, no forwarding. Accepts only `prepare`, `release` or `deploy <sha> [--ghcr-user <name>]` and `status`; logs to syslog                                                          |
| Sudo rule `/etc/sudoers.d/mtogo-deploy`           | root    | Only those four subcommands of `/usr/local/sbin/mtogo-deploy.sh`                                                                                                                        |
| `/usr/local/sbin/mtogo-deploy.sh`                 | root    | Enforces the same four forms again for any sudo caller outside the `sudo` group, so the sudo rule's wildcards add nothing; starts only the containers of the release's own Compose file |

`restore`, `rollback`, `seed`, `psql`, `logs` and `compose` stay with
administrators. The deploy user must not be in the `docker` group (that is
root access) and needs no password.

1. Force the command on the key in `/home/deploy/.ssh/authorized_keys` by
   prefixing its line (keep the key itself unchanged):

   ```text
   restrict,command="/usr/local/sbin/mtogo-deploy-ssh" ssh-ed25519 AAAA... mtogo-staging-ci
   ```

2. Enforce it for every login of the user, as a second layer:

   ```bash
   sudo tee /etc/ssh/sshd_config.d/mtogo-deploy.conf > /dev/null <<'EOF'
   Match User deploy
       ForceCommand /usr/local/sbin/mtogo-deploy-ssh
       PasswordAuthentication no
       PermitTTY no
       AllowTcpForwarding no
       AllowAgentForwarding no
       X11Forwarding no
       PermitUserRC no
   EOF
   sudo sshd -t && sudo systemctl reload ssh
   ```

3. Install the sudo rule, adjusting the user name if it is not `deploy`:

   ```bash
   sudo install -o root -g root -m 440 deploy/staging/sudoers.example /etc/sudoers.d/mtogo-deploy
   sudo visudo -cf /etc/sudoers.d/mtogo-deploy
   ```

4. Remove other privileges and check:

   ```bash
   id deploy                      # no docker, sudo or adm group
   sudo gpasswd -d deploy docker  # only if it is listed
   sudo passwd -l deploy
   sudo -l -U deploy              # lists only the four MTOGO_CI commands
   ```

5. Test from your own machine with the CI key. `status` works before the first
   release; everything else is rejected:

   ```bash
   ssh -i <ci key> deploy@<droplet> status    # current release: none
   ssh -i <ci key> deploy@<droplet>           # rejected: no command
   ssh -i <ci key> deploy@<droplet> id        # rejected: unknown command
   ```

### 5. Caddy and firewall

Add the three site blocks from `deploy/staging/Caddyfile.example` to the
existing Caddy configuration and reload it. With Caddy in a container, set
`STAGING_BIND_ADDRESS` to the `docker0` gateway address and proxy to it, as
the example explains. Allow only 22, 80 and 443 in the firewall; the
application ports are bound to the loopback or bridge address.

The event streams need no extra Caddy directive: the partner kitchen and
Delivery agent feeds and the Customer tracking feed (#215, through the
storefront's same-origin relay `/api/orders/:id/tracking/stream`) are sent with
`Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`, so
`encode gzip` leaves them uncompressed and `reverse_proxy` flushes
`text/event-stream` responses at once. To check a deployed feed, open an Order
page while signed in: the progress panel says "Live updates on" within about
fifteen seconds. If it says live updates are interrupted, the page still checks
every ten seconds; look for a proxy that buffers or compresses the stream.

### 6. Activation

Activation is a separate decision. When approved, confirm the four
`STAGING_SSH_*` repository secrets, set the repository variable
`STAGING_DEPLOY_ENABLED=true`, and run the Deploy workflow manually (no input)
or deliver an issue. The first run takes longer: the dependency layer has no
cache yet. After the first release, check the three GHCR packages' visibility
(public packages need no token on the Droplet), then create the first admin
user and seed the synthetic Restaurant and menu:

```bash
sudo mtogo-deploy.sh compose exec backend npm exec --no -- medusa user --email admin@example.test --password '<choose one>'
sudo mtogo-deploy.sh seed
```

Sign in at `https://api.staging.example.org/app` and put the real URLs on this
page. Store the admin password in the team's password manager, not in an
issue.

### Values summary

| Where                        | Name                                                                                                                         | Purpose                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| GitHub repository secrets    | `STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_KEY`, `STAGING_SSH_KNOWN_HOSTS`                                         | SSH to the Droplet as the deploy user                        |
| GitHub repository variable   | `STAGING_DEPLOY_ENABLED`                                                                                                     | `true` activates the two staging jobs; unset until approved  |
| GitHub, automatic            | `GITHUB_TOKEN`                                                                                                               | Push to GHCR; one-off pull login on the Droplet              |
| Droplet `.env`               | `STAGING_STOREFRONT_URL`, `STAGING_BACKEND_URL`, `STAGING_PARTNER_URL`                                                       | Public origins; also CORS, invite links and upload URLs      |
| Droplet `.env`               | `STAGING_IMAGE_PREFIX`, `STAGING_BIND_ADDRESS`, `STAGING_*_PORT`, `STAGING_DEFAULT_REGION`                                   | Images, where Caddy reaches the apps, seed region            |
| Droplet `.env`               | `STAGING_DB_NETWORK`, `STAGING_DB_HOST`, `STAGING_DB_PORT`, `STAGING_DB_NAME`, `STAGING_DB_USER`, `STAGING_DB_PASSWORD`      | The existing `db` container and the restricted role          |
| Droplet `.env`               | `JWT_SECRET`, `COOKIE_SECRET`, `STAGING_SPLIT_WORKER`, `BACKEND_HEAP_MB`                                                     | Medusa secrets, worker mode and memory                       |
| Droplet `.env`               | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (optional)                                                                             | Customer verification emails via Resend (`corral.dk`)        |
| Droplet `.env`               | `ORS_API_KEY` (optional)                                                                                                     | Delivery distances via openrouteservice                      |
| Droplet `.env`               | `MTOGO_FF_RESTAURANT_STATEMENTS` (`true` in the template, off when unset)                                                    | Feature flag releasing Restaurant statements (#52, ADR-0022) |
| Droplet `.env`               | `STAGING_METRICS_ENABLED`, `STAGING_GRAFANA_URL`, `STAGING_GRAFANA_PORT`, `GRAFANA_ADMIN_PASSWORD` (optional)                | Private request monitoring (`mtogo-deploy.sh monitoring`)    |
| Storefront image, build time | `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_DEFAULT_REGION`, `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` | Returned by `prepare`, inlined by Next.js                    |

The Customer delivery map (#214) needs no variable or key: the storefront
loads OpenStreetMap's standard tiles in the browser. See
[the delivery map](/MTGO/product/customer-order-tracking/#delivery-map-214)
for the provider's terms.

Missing or malformed values fail visibly: Compose refuses to start with a
message naming the variable, the deploy script names the missing `.env` key or
Docker network, and the workflow names the missing secret. None of them prints
a secret value. The publishable key is public by design (browsers send it),
but the workflow masks it in logs anyway.

## Runbook

All commands run on the Droplet as an administrator. `sudo mtogo-deploy.sh help`
lists them.

### Status and release identity

```bash
sudo mtogo-deploy.sh status
```

Prints the current and previous release SHA and the container table with
health and image. Every container also carries `MTOGO_RELEASE` in its
environment, and the images carry the `org.opencontainers.image.revision`
label.

### Logs

```bash
sudo mtogo-deploy.sh logs                                  # last 10 minutes, all services
sudo mtogo-deploy.sh logs --follow --tail=100 backend
sudo mtogo-deploy.sh logs --since=1h storefront partner
journalctl -t mtogo-deploy-ssh --since today               # accepted and rejected SSH requests
```

Service names: `backend`, `storefront`, `partner`, `redis`, and `worker` in
split mode. Docker keeps five rotated 10 MB files per container. PostgreSQL's
own log stays with the existing stack (`docker logs db`). The
[logging guide](/MTGO/quality/logging/) explains the event records and how to
follow a request ID across the partner app and the backend.

### Smoke check: the storefront talks to the backend

The deploy job already checks `/store/regions` with the real publishable key
and that the storefront renders `/dk/store`. By hand:

```bash
key=$(sudo mtogo-deploy.sh psql -tA -c \
  "select token from api_key where type='publishable' and revoked_at is null limit 1" < /dev/null)
curl -sS -H "x-publishable-api-key: $key" https://api.staging.example.org/store/regions | head -c 300
curl -sS https://staging.example.org/dk/store | grep -c MTOGO
```

The first `curl` must return JSON with a region; the second a count above
zero. Then open the storefront in a browser and confirm the Restaurant list
loads, and open `https://api.staging.example.org/app` and confirm the admin
login page appears and rejects a wrong password.

### Persistence check

```bash
sudo mtogo-deploy.sh compose restart backend storefront partner
sudo mtogo-deploy.sh status
```

Orders, Restaurants and uploaded images are still there afterwards. The
staging data lives in the `mtogo_staging` database of the existing PostgreSQL
container. New photos live in the private Tigris `mtogo` bucket, while legacy
local uploads remain in `mtogo-staging_backend-static`. Redis holds events, workflow state
and sessions: restarting it signs users out but loses no business data.

### End legacy Orders without timing

Orders placed before the Order Operations module show "Timing unknown" and
stay awaiting acceptance forever. List them, then cancel each with a full
refund as the system's timeout (safe to repeat):

```bash
sudo mtogo-deploy.sh compose run --rm migrate npm exec --no -- medusa exec ./src/scripts/cancel-legacy-awaiting-orders.js
sudo mtogo-deploy.sh compose run --rm migrate npm exec --no -- medusa exec ./src/scripts/cancel-legacy-awaiting-orders.js apply
```

Each refund appears in the logs as `refund.attempted` with `actor_id` `system`.

### Seed demo Restaurant statements

Delivered demo Orders for the Statements page (#228), spread over the current
month's active dates of "Pizzeria Nørrebro" and three other active, open
Restaurants with a menu. The deploy's migrations must have run first. It is
safe to repeat: a later run adds only the days since the last one, and a run
in a new month leaves the previous month as a closed statement. Use
`-e DEMO_STATEMENTS_RESTAURANT_ID=<id>` to seed another Restaurant than
Pizzeria Nørrebro, and `-e DEMO_STATEMENTS_STAFF_PASSWORD=<password>` to give
the other Restaurants' demo staff a sign-in (the log names their emails).
`-e DEMO_STATEMENTS_REMOVE_BLOCKERS=true` first soft-deletes that
Restaurant's earlier test Orders that keep the month incomplete (delivered
without a preserved purchase basis, or with prepared-food compensation), and
logs their numbers:

```bash
sudo mtogo-deploy.sh compose run --rm migrate npm exec --no -- medusa exec ./src/scripts/seed-demo-statements.js
```

The page shows only while `MTOGO_FF_RESTAURANT_STATEMENTS=true`.

### Database backup and restore

`prepare` dumps the staging database to
`/srv/mtogo-staging/backups/<time>-<sha>.dump` (`pg_dump --format=custom`,
mode 600) **before every migration run** and keeps the newest ten. The dump
runs as the restricted role and contains only `mtogo_staging`; the existing
stack's databases are never read. Take one by hand at any time:

```bash
sudo mtogo-deploy.sh backup
```

Restore a dump from that folder (stops the application containers, restores,
starts them again):

```bash
sudo mtogo-deploy.sh restore /srv/mtogo-staging/backups/<file>.dump --yes
```

Limitations:

- A restore replaces the whole staging database. Everything written after the
  dump is lost.
- The `pg_trgm` and `unaccent` extensions are skipped on restore; they belong
  to the superuser and stay installed. On a new server, run the `CREATE
EXTENSION` lines from step 2 before restoring.
- Tigris objects are not part of the database dump. Back up the private
  `mtogo` bucket separately and retain it across database restore or rollback.
- Legacy files in `backend-static` are not part of the dump. Copy the
  volume separately if they matter:
  `docker run --rm -v mtogo-staging_backend-static:/s -v "$PWD":/b alpine tar czf /b/static.tgz -C /s .`
- The dumps stay on the Droplet. Copy important ones off with `scp`; losing
  the Droplet loses the backups. Backups of the existing stack are its own
  concern.
- A dump taken before a migration matches the previous release's schema.
  Restore it only together with that release (see rollback).

### Roll back to the previous release

```bash
sudo mtogo-deploy.sh rollback
```

This redeploys `releases/previous` with its own Compose file and images and
**skips migrations**. Application rollback does not reverse database
migrations: the new release's migrations stay applied. That is fine when they
only added tables or columns the old code ignores (the usual case). When the
old code cannot run on the new schema, restore the dump that `prepare` took
before the migrations, then roll back:

```bash
sudo mtogo-deploy.sh status                       # note the previous SHA
sudo mtogo-deploy.sh restore /srv/mtogo-staging/backups/<time>-<new sha>.dump --yes
sudo mtogo-deploy.sh rollback
```

Only the current and the previous release are kept on the Droplet (release
folders and images). Any older verified release can be redeployed from GitHub
with the manual Deploy run and `release_sha`, as long as its images still
exist in GHCR.

Deploys and rollback leave the optional monitoring stack, its configuration
and its history alone. After a rollback to a release without the metrics
exporter, the dashboard shows the backend **DOWN** until an instrumented
release runs again; see
[releases and rollback](/MTGO/quality/staging-request-monitoring/#releases-and-rollback).

### Troubleshooting

- **SSH step fails with "rejected":** the workflow and the installed
  `mtogo-deploy-ssh` disagree. Re-install the scripts from the same commit and
  check `journalctl -t mtogo-deploy-ssh`.
- **"sudo: a password is required":** the sudo rule is missing or names
  another user; `sudo -l -U deploy` must list the four commands.
- **"must be owned by root":** step 1 of the server setup is not done.
- **"Docker network … does not exist" or "PostgreSQL … is not reachable":**
  `STAGING_DB_NETWORK` or `STAGING_DB_HOST` is wrong, or `db` is stopped
  (`docker ps --filter name=db`).
- **Migrations fail with "password authentication failed" or "permission
  denied":** check the role's password and that it owns `mtogo_staging`
  (`\l mtogo_staging` in psql as the superuser).
- **Deploy run fails in `prepare` with "cannot pull":** the image was not
  built (check `release_images`), or the package is private and the token
  login failed. Make the packages public or check the workflow log.
- **"another deployment is running":** a previous run still holds
  `/srv/mtogo-staging/.deploy.lock`. Wait for it or look for a hung
  `mtogo-deploy.sh` with `ps`.
- **Backend health check never passes:** `sudo mtogo-deploy.sh logs backend`.
  Typical causes are database credentials or an out-of-memory kill
  (`dmesg | grep -i kill`); lower `BACKEND_HEAP_MB`.
- **`/store/regions` check fails from GitHub:** DNS, Caddy or the firewall.
  `curl -I https://api.staging.example.org/health` from your machine should
  return 200.
- **Admin login works but CORS errors appear in the browser:** the
  `STAGING_*_URL` values must match the hostnames in Caddy exactly, with
  `https://` and without a trailing slash.

## What this slice does not include

No zero-downtime deployment, no off-Droplet backups, no production
environment and no Terraform. Request metrics and their Grafana dashboard are
a separate, optional stack: see
[staging request monitoring](/MTGO/quality/staging-request-monitoring/). Logging conventions
are in the [logging guide](/MTGO/quality/logging/). The release practice for
SemVer tags is issue #68.
