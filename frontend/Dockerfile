# ABOUTME: Multi-stage Dockerfile for the Next.js frontend container.
# ABOUTME: Produces a standalone Node.js server with SQLite (libsql) support on port 3000.

FROM node:22-alpine AS builder
ARG NEXT_PUBLIC_BASE_PATH=""
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --silent
COPY . .
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules/.package-lock.json ./node_modules/.package-lock.json
# Copy native libsql bindings that standalone misses
COPY --from=builder /app/node_modules/@libsql ./node_modules/@libsql
COPY --from=builder /app/node_modules/libsql ./node_modules/libsql
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "server.js"]
