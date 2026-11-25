# Staging deployment files

The staging stack for the DigitalOcean Droplet (issue #35). The runbook,
hosting plan, secrets and manual server steps are in the docs site page
[Staging deployment](../../apps/docs/src/content/docs/quality/staging-deployment.md).
The stack reuses the Droplet's existing Caddy and PostgreSQL container and
never changes the existing Compose stack.

| File                  | Purpose                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Dockerfile`          | Release images: targets `backend`, `partner` and `storefront`, built by `.github/workflows/on_main.yml`       |
| `compose.yaml`        | The staging stack; extracted from the backend image of each release by the deploy script                      |
| `.env.template`       | Values and secrets for `/srv/mtogo-staging/.env` on the Droplet                                               |
| `mtogo-deploy.sh`     | Installed as `/usr/local/sbin/mtogo-deploy.sh`: prepare, release, rollback, backup, restore, logs, monitoring |
| `mtogo-deploy-ssh.sh` | Installed as `/usr/local/sbin/mtogo-deploy-ssh`: forced SSH command that accepts only the four CI requests    |
| `sudoers.example`     | Lets the deploy user run only those four subcommands of the deploy script as root                             |
| `Caddyfile.example`   | Site blocks for the Caddy that already runs on the Droplet                                                    |

Optional request monitoring (Prometheus, Grafana and Node Exporter) lives in
`deploy/monitoring/compose.staging.yaml` and is run with
`sudo mtogo-deploy.sh monitoring up` (`monitoring update` installs a release's
monitoring files; deploys and rollback never change them, #180); the runbook is
[Staging request monitoring](../../apps/docs/src/content/docs/quality/staging-request-monitoring.md).
