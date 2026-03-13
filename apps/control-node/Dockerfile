FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.json ./
COPY packages ./packages
COPY apps/control-node ./apps/control-node

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @agentharbor/config build
RUN pnpm --filter @agentharbor/shared build
RUN pnpm --filter @agentharbor/control-node prisma generate
RUN pnpm --filter @agentharbor/control-node build

EXPOSE 8443

CMD ["sh", "-c", "pnpm --filter @agentharbor/control-node prisma db push && pnpm --filter @agentharbor/control-node start"]
