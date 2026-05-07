# Docker Tailnet Gateway

This repo now uses a **single host Tailscale URL** with **path-based routing** for Docker web apps.

Current URL shape:

```text
https://lemnis-mac-mini.tail3cc92f.ts.net/<app>
```

Current app path:

```text
https://lemnis-mac-mini.tail3cc92f.ts.net/intel-briefing
```

Known caveat: apps that emit absolute redirects or asset paths may need explicit rewrite rules. Intel Briefing has redirect rewrites configured for its top-level routes.

## How it works

- Tailscale HTTPS is served by the **host Mac mini**.
- Traefik runs in Docker as a local reverse proxy on `127.0.0.1:18080`.
- Docker apps register themselves with Traefik using labels.
- Routing is by **path prefix**, not by separate tailnet hostnames.

This avoids needing a separate Tailscale auth key and node per app.

## Start / reload

Start the Docker gateway:

```bash
docker compose -f docker-compose.gateway.yml up -d
```

Apply the host Tailscale serve config:

```bash
tailscale serve --https=443 --bg http://127.0.0.1:18080
```

## Register an app

Add labels like this:

```yaml
labels:
  - traefik.enable=true
  - traefik.http.routers.intel-briefing.rule=PathPrefix(`/intel-briefing`)
  - traefik.http.routers.intel-briefing.entrypoints=web
  - traefik.http.middlewares.intel-briefing-strip.stripprefix.prefixes=/intel-briefing
  - traefik.http.middlewares.intel-briefing-prefix.redirectregex.regex=^/(dashboard|data|ai|briefing|connections|console|pipeline|sources|status|settings|api(?:/.*)?)$
  - traefik.http.middlewares.intel-briefing-prefix.redirectregex.replacement=/intel-briefing/$$1
  - traefik.http.routers.intel-briefing.middlewares=intel-briefing-prefix,intel-briefing-strip
  - traefik.http.services.intel-briefing.loadbalancer.server.port=3000
```

## Deregister an app

Remove its `traefik.*` labels and recreate the container:

```bash
docker compose up -d --force-recreate <service>
```

## Register future apps quickly

Use the helper script:

```bash
scripts/register-tailnet-path-app --service <compose-service> --name <path-slug> --port <internal-port>
```

Example:

```bash
scripts/register-tailnet-path-app --service frontend --name intel-briefing --port 3000
docker compose -f docker-compose.yml -f gateway/apps/intel-briefing.override.yml up -d frontend
```

This writes an override file under `gateway/apps/` instead of editing the base compose by hand.

## Add another app path

Copy the label pattern and change the name/path, for example:

- `/lantern`
- `/crawl4ai`

Caveat: the upstream app must tolerate living under a base path, or you need app-specific rewrite support.

## Safety notes

- Keep `/var/run/docker.sock` read-only.
- Only publish apps you actually want visible on the tailnet.
- Use Tailscale ACLs to control who can reach the Mac mini URL.
