FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@10.4.1

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build


FROM node:20-alpine
WORKDIR /app

RUN npm install -g pnpm@10.4.1

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY drizzle ./drizzle

RUN mkdir -p /app/uploads

EXPOSE 3000
ENV NODE_ENV=production
ENV STORAGE_DIR=/app/uploads

CMD ["node", "dist/index.js"]
