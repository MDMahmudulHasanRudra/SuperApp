# Single-container image for platforms that build from the repo root (Render, Fly, …).
# Identical to Dockerfile.backend except that it honours the platform's $PORT.
# For local development use docker-compose.yml, which also brings up PostgreSQL.

# Stage 1: build the React frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public/ ./public/
COPY src/ ./src/
RUN npm run build

# Stage 2: Express backend serving the API + the built frontend
FROM node:20-alpine

# Real network tooling for the ping/traceroute/dns/whois endpoints
RUN apk add --no-cache iputils traceroute whois net-tools bind-tools curl

WORKDIR /app
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev
COPY backend/ ./backend/
COPY --from=frontend-build /app/dist ./dist/

ENV NODE_ENV=production
ENV PORT=12000
EXPOSE 12000

# Requires DATABASE_URL to point at a PostgreSQL instance.
CMD ["node", "backend/server.js"]
