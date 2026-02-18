# ABOUTME: Dockerfile for the cron sidecar container.
# ABOUTME: Runs a node-cron scheduler that triggers /api/cron/pipeline on the frontend.
FROM node:22-alpine

WORKDIR /app
COPY package.json tsconfig.json index.ts ./
RUN npm install --production

CMD ["npx", "tsx", "index.ts"]
