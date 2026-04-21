require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const supabase = require('./db');
const { runScraper } = require('../scraper/index');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ─── Servir le frontend ──────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend/public')));

// ─── API Routes ──────────────────────────────────────────────────────────────

// GET /api/jobs — liste des offres avec filtres
app.get('/api/jobs', async (req, res) => {
  try {
    const {
      q,           // recherche texte
      city,        // ville
      contract,    // CDI | CDD | Freelance | Stage
      remote,      // Full Remote | Hybride | Sur site
      source,      // jobup | swissdev | indeed | emploi_it | jobs_ch
      page = 1,
      limit = 20,
      sort = 'scraped_at', // scraped_at | posted_at
    } = req.query;

    let query = supabase
      .from('jobs')
      .select('*', { count: 'exact' })
      .eq('is_active', true);

    // Filtres
    if (city) query = query.ilike('city', `%${city}%`);
    if (contract) query = query.eq('contract', contract);
    if (remote) query = query.eq('remote', remote);
    if (source) query = query.eq('source', source);

    // Recherche full-text
    if (q) {
      query = query.or(`title.ilike.%${q}%,company.ilike.%${q}%,description.ilike.%${q}%`);
    }

    // Tri et pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query
      .order(sort, { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      jobs: data,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / parseInt(limit)),
    });
  } catch (err) {
    console.error('/api/jobs error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats — statistiques globales
app.get('/api/stats', async (req, res) => {
  try {
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('source, city, contract, remote, scraped_at')
      .eq('is_active', true);

    if (error) throw error;

    const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 heures en millisecondes
    const newJobs = jobs.filter(j => new Date(j.scraped_at) > since48h);

    const bySource = {};
    const byCity = {};
    jobs.forEach(j => {
      bySource[j.source] = (bySource[j.source] || 0) + 1;
      byCity[j.city] = (byCity[j.city] || 0) + 1;
    });

    res.json({
      total: jobs.length,
      newLast48h: newJobs.length,
      remote: jobs.filter(j => j.remote !== 'Sur site').length,
      bySource,
      byCity: Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 8),
      lastScraped: jobs[0]?.scraped_at || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/:id — détail d'une offre
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'Offre non trouvée' });
  }
});

// POST /api/scrape — déclencher un scraping manuel (protégé)
app.post('/api/scrape', async (req, res) => {
  const secret = req.headers['x-scrape-secret'] || req.body?.secret;
  if (secret !== process.env.SCRAPE_SECRET) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  console.log('Scraping manuel déclenché via API');
  res.json({ message: 'Scraping démarré en arrière-plan' });

  // Lancer en arrière-plan sans bloquer la réponse
  runScraper().catch(err => console.error('Scrape error:', err));
});

// GET /api/health — healthcheck pour Render
app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback SPA
app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// ─── Cron — scrape toutes les 6h ────────────────────────────────────────────
// '0 */6 * * *' = à 0min, toutes les 6h
cron.schedule('0 */6 * * *', () => {
  console.log('⏰ Cron: démarrage du scraping automatique');
  runScraper().catch(err => console.error('Cron scrape error:', err));
});

// ─── Démarrage ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ Serveur démarré sur http://localhost:${PORT}`);
  console.log(`   API:      http://localhost:${PORT}/api/jobs`);
  console.log(`   Stats:    http://localhost:${PORT}/api/stats`);
  console.log(`   Frontend: http://localhost:${PORT}`);
  console.log(`\n⏰ Scraping automatique: toutes les 6h`);
  console.log(`   Prochain scraping: dans ~6h\n`);

  // Premier scraping au démarrage si la DB est vide
  supabase.from('jobs').select('id', { count: 'exact', head: true })
    .then(({ count }) => {
      if (count === 0) {
        console.log('Base vide — premier scraping en cours...');
        runScraper().catch(console.error);
      }
    });
});
