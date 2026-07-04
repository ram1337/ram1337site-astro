FROM node:24-slim@sha256:b31e7a42fdf8b8aa5f5ed477c72d694301273f1069c5a2f71d53c6482e99a2fc

RUN DEBIAN_FRONTEND=noninteractive apt-get update && apt-get install -y --no-install-recommends \
    curl \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 2000 app && useradd --uid 2000 --gid 2000 -m -s /bin/bash app

WORKDIR /app

COPY --chown=app:app . .

RUN if [ -f yarn.lock ]; then \
  corepack enable; \
  if [ "$(yarn --version | cut -d. -f1)" = "1" ]; then \
    yarn install --check-files; \
  else \
    yarn install --immutable; \
  fi; \
elif [ -f pnpm-lock.yaml ]; then \
  corepack enable && pnpm install; \
elif [ -f package-lock.json ]; then \
  npm ci --verbose; \
elif [ -f package.json ]; then \
  npm install --verbose; \
else \
  echo "No package.json found - skip installing dependencies"; \
fi

RUN npm run build || true
