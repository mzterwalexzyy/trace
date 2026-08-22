# TRACE — long-running Node server (stateful: holds the active graph in memory).
# Deploy to any container host (Railway, Render, Fly.io, a VM). NOT Vercel
# serverless — TRACE needs a persistent process, not stateless functions.
FROM node:20-slim

# git is required for cloning repositories by URL.
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Cap V8 heap so the Vite/tsc build stays under small hosts' memory limit
# (e.g. Render's free 512MB) instead of being OOM-killed, which would leave the
# previous image serving. Scoped to the build only, not the runtime server.
RUN NODE_OPTIONS=--max-old-space-size=460 npm run build

ENV PORT=3000
ENV TRACE_HOST=0.0.0.0
EXPOSE 3000

# Binds to 0.0.0.0 via the platform PORT. Runtime env vars (HydraDB, Supabase,
# AI provider) are supplied by the host, never baked into the image.
CMD ["npm", "run", "server"]
