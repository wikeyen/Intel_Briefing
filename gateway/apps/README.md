# Generated app overrides

Each `*.override.yml` file in this directory adds Traefik labels to a Docker Compose
service so it can be published at:

`https://lemnis-mac-mini.tail3cc92f.ts.net/<app>`

Generate one with:

```bash
scripts/register-tailnet-path-app --service <compose-service> --name <path-slug> --port <internal-port>
```

Then apply it with Compose:

```bash
docker compose -f docker-compose.yml -f gateway/apps/<path-slug>.override.yml up -d <compose-service>
```
