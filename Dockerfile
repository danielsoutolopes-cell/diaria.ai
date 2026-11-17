# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat python3 make g++

# 1. Dependências
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# 2. Build da Aplicação Next.js
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Argumentos de build para expor variáveis públicas necessárias no Next.js build
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_R2_URL
ARG NEXT_PUBLIC_APP_URL

RUN npm run build

# 3. Imagem Final de Execução (Otimizada e Segura)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV DATA_DIR=/data

RUN apk add --no-cache libc6-compat

# Cria diretório de montagem de volume com permissão
RUN mkdir -p /data

# Copia arquivos estáticos e bundle compilado do Next.js
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/server-baileys.js ./server-baileys.js
COPY --from=builder /app/start-production.js ./start-production.js
COPY --from=builder /app/src ./src

EXPOSE 3000

CMD ["node", "start-production.js"]
