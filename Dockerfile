# ──────────────────────────────────────────────────────────────────────────────
# Étape 1 : Build du Frontend (React + Vite)
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

# Installation de pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 1. Copie des dépendances de la racine pour le cache
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 2. Copie et installation des dépendances du frontend (Important pour le build)
COPY frontend/package.json frontend/pnpm-lock.yaml ./frontend/
RUN cd frontend && pnpm install --frozen-lockfile

# 3. Copie du code source du frontend et build
COPY frontend/ ./frontend/
RUN cd frontend && pnpm run build

# ──────────────────────────────────────────────────────────────────────────────
# Étape 2 : Image de Production (Node + Playwright Dependencies)
# ──────────────────────────────────────────────────────────────────────────────
# On utilise l'image officielle Playwright qui contient déjà tous les navigateurs 
# et surtout toutes les bibliothèques système Linux nécessaires.
FROM mcr.microsoft.com/playwright:v1.49.1-noble

# Installation de pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# On définit l'environnement en production
ENV NODE_ENV=production
ENV PORT=3000

# Copie des fichiers de package et du lock
COPY package.json pnpm-lock.yaml ./
# Installation des dépendances de production uniquement (pour l'API et le Scraper)
RUN pnpm install --frozen-lockfile --prod

# Copie du code de l'API et du Scraper
COPY api/ ./api/
COPY scraper/ ./scraper/

# Copie du frontend compilé depuis l'étape précédente
COPY --from=builder /app/frontend/dist ./frontend/dist

# Exposer le port
EXPOSE 3000

# Commande de démarrage
CMD ["pnpm", "start"]
