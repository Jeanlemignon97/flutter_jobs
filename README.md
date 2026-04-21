# Flutter Jobs — Suisse romande

Agrégateur automatique d'offres Flutter en Suisse romande.
Scrape Jobup.ch, SwissDevJobs, Indeed CH, Emploi-IT et Jobs.ch toutes les 6h.

## Stack
- **Scraper** : Node.js + Playwright (headless Chrome)
- **API** : Express.js
- **Base de données** : Supabase (PostgreSQL, gratuit)
- **Cron** : node-cron (toutes les 6h)
- **Hébergement** : Render.com (gratuit)

---

## Installation locale

### 1. Cloner et installer

```bash
git clone <ton-repo>
cd flutter-jobs
npm install
npx playwright install chromium --with-deps
```

### 2. Créer le projet Supabase

1. Va sur https://supabase.com et crée un compte gratuit
2. Crée un nouveau projet (région : Europe West)
3. Va dans **SQL Editor** et colle le contenu de `supabase_schema.sql`
4. Va dans **Settings > API** pour copier :
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_KEY`

### 3. Configurer les variables d'environnement

```bash
cp .env.example .env
# Édite .env avec tes vraies valeurs Supabase
```

### 4. Lancer en local

```bash
# Démarrer le serveur + frontend
npm run dev

# Dans un autre terminal, tester le scraper
npm run scrape:test

# Lancer le vrai scraping (peuple la DB)
npm run scrape
```

Ouvre http://localhost:3000

---

## Déploiement sur Render.com

### Méthode 1 — Via render.yaml (recommandée)

1. Push le projet sur GitHub
2. Va sur https://render.com > **New > Blueprint**
3. Connecte ton repo GitHub
4. Render détecte `render.yaml` automatiquement
5. Dans **Environment Variables**, ajoute :
   - `SUPABASE_URL` = ton URL Supabase
   - `SUPABASE_KEY` = ta clé anon Supabase
6. Clique **Apply** → Render déploie automatiquement

### Méthode 2 — Manuel

1. Render > **New > Web Service**
2. Connecte ton repo
3. Paramètres :
   - **Build Command** : `npm install && npx playwright install chromium --with-deps`
   - **Start Command** : `npm start`
   - **Region** : Frankfurt (le plus proche)
4. Ajoute les variables d'environnement

### Note importante sur Render gratuit

Le plan gratuit met le serveur en veille après 15min d'inactivité.
Pour garder le scraper actif, utilise un service de ping gratuit comme :
- https://cron-job.org (ping /api/health toutes les 14min)
- https://uptimerobot.com

---

## Utilisation

### Frontend
Ouvre l'URL Render dans ton navigateur.
- Filtre par ville, contrat, télétravail
- Recherche par mot-clé
- Clique sur une offre → redirige vers le site source

### Déclencher un scraping manuel
Clique sur "Actualiser les offres" dans la sidebar.
Entre ta `SCRAPE_SECRET` (visible dans Render > Environment).

### API

```bash
# Toutes les offres
GET /api/jobs

# Avec filtres
GET /api/jobs?q=flutter&city=Genève&contract=CDI&remote=Hybride&page=1&limit=20

# Statistiques
GET /api/stats

# Scraping manuel
POST /api/scrape
Headers: x-scrape-secret: <ta-clé>
```

---

## Ajouter une nouvelle source

Crée un fichier dans `scraper/` :

```javascript
// scraper/ma-source.js
async function scrapeMaSource() {
  const jobs = [];
  // ... logique de scraping
  return jobs; // tableau d'objets job
}
module.exports = { scrapeMaSource };
```

Puis ajoute-le dans `scraper/index.js` :

```javascript
const { scrapeMaSource } = require('./ma-source');
// Dans scrapers array:
{ name: 'Ma Source', fn: scrapeMaSource },
```

### Format d'un objet job

```javascript
{
  external_id: 'source_uniqueid',  // identifiant unique
  source: 'ma_source',
  title: 'Flutter Developer',
  company: 'Entreprise SA',
  city: 'Genève',
  region: 'Suisse romande',
  contract: 'CDI',               // CDI | CDD | Freelance | Stage
  remote: 'Hybride',             // Full Remote | Hybride | Sur site
  salary: '120k CHF',            // optionnel
  description: '...',            // optionnel
  tags: ['Flutter', 'Dart'],
  url: 'https://...',
  posted_at: '2026-04-21T...',
  scraped_at: new Date().toISOString(),
  is_active: true,
}
```

---

## Coûts

| Service | Plan | Coût |
|---------|------|------|
| Render.com | Free | 0€ |
| Supabase | Free (500MB) | 0€ |
| **Total** | | **0€/mois** |
