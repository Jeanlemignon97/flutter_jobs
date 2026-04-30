# ──────────────────────────────────────────────────────────────────────────────
# Étape 1 : Build du Frontend (React + Vite)
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

# Installation de pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 1. Copie des dépendances de la racine pour le cache
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 2. Copie et installation des dépendances du frontend
COPY frontend/package.json frontend/pnpm-lock.yaml ./frontend/
RUN cd frontend && pnpm install --frozen-lockfile

# 3. Copie du code source du frontend et build
COPY frontend/ ./frontend/
RUN cd frontend && pnpm run build

# ──────────────────────────────────────────────────────────────────────────────
# Étape 2 : Image de Production (Node + Minimal Playwright)
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim

# Installation des dépendances système minimales pour Chromium
# On utilise playwright install-deps qui est l'outil officiel pour ça
RUN apt-get update && \
    npx playwright install-deps chromium && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Installation de pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# On définit l'environnement en production
ENV NODE_ENV=production
ENV PORT=3000

# Copie des fichiers de package et du lock
COPY package.json pnpm-lock.yaml ./
# Installation des dépendances de production uniquement
RUN pnpm install --frozen-lockfile --prod

# Copie du code de l'API et du Scraper
COPY api/ ./api/
COPY scraper/ ./scraper/

# Copie du frontend compilé depuis l'étape précédente
COPY --from=builder /app/frontend/dist ./frontend/dist

# Installation de Chromium (le binaire uniquement, sans les autres navigateurs)
RUN npx playwright install chromium

# Exposer le port
EXPOSE 3000

# Commande de démarrage
CMD ["pnpm", "start"]
