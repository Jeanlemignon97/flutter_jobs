# ──────────────────────────────────────────────────────────────────────────────
# Étape 1 : Build du Frontend (React + Vite)
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

# Installation de pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copie des fichiers de dépendances de la racine et du frontend
COPY package.json pnpm-lock.yaml ./
COPY frontend/package.json ./frontend/

# Installation des dépendances (incluant celles nécessaires au build frontend)
RUN pnpm install --frozen-lockfile

# Copie du code source du frontend
COPY frontend/ ./frontend/
COPY tsconfig.app.json tsconfig.node.json tsconfig.json ./frontend/ 2>/dev/null || true

# Build du frontend
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

# On s'assure que Chromium est prêt (déjà inclus dans l'image mais on vérifie)
RUN npx playwright install chromium

# Exposer le port
EXPOSE 3000

# Commande de démarrage
CMD ["pnpm", "start"]
