# One image for the API and the worker (same code, different command). FFmpeg comes from Debian.
#   docker build -t buildx-studio .
#   API:    docker run --env-file .env -p 8787:8787 buildx-studio
#   Worker: docker run --env-file .env buildx-studio node --import tsx apps/worker/src/main.ts
FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY tsconfig.base.json ./
COPY fonts ./fonts
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
ENV NODE_ENV=production PORT=8787 STUDIO_LOCAL_DIR=/data WORK_DIR=/tmp/studio
RUN mkdir -p /data /tmp/studio && chown -R node:node /data /tmp/studio
USER node
EXPOSE 8787
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx", "apps/api/src/main.ts"]
