require('dotenv').config();
const supabase = require('../api/db');
const { scrapeJobup } = require('./jobup');
const { scrapeSwissDevJobs } = require('./swissdev');
const { scrapeIndeed } = require('./indeed');
const { scrapeEmploiIT, scrapeJobsCH } = require('./static-scrapers');

const IS_TEST = process.argv.includes('--test');

async function upsertJobs(jobs) {
  if (jobs.length === 0) return { inserted: 0, updated: 0 };

  let inserted = 0;
  let updated = 0;

  // Batch par 50 pour ne pas dépasser les limites Supabase
  for (let i = 0; i < jobs.length; i += 50) {
    const batch = jobs.slice(i, i + 50);

    const { data, error } = await supabase
      .from('jobs')
      .upsert(batch, {
        onConflict: 'external_id,source',
        ignoreDuplicates: false,
      })
      .select('id');

    if (error) {
      console.error('Supabase upsert error:', error.message);
      continue;
    }

    inserted += data?.length || 0;
  }

  return { inserted, updated };
}

async function markStaleJobsInactive() {
  // Marquer comme inactives les offres non revues depuis 7 jours
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { error } = await supabase
    .from('jobs')
    .update({ is_active: false })
    .lt('scraped_at', sevenDaysAgo.toISOString())
    .eq('is_active', true);

  if (error) console.error('Erreur markStale:', error.message);
}

async function runScraper() {
  const startTime = Date.now();
  console.log(`\n🚀 Démarrage du scraper — ${new Date().toLocaleString('fr-FR')}`);
  console.log(`Mode: ${IS_TEST ? 'TEST (pas d\'upsert Supabase)' : 'PRODUCTION'}\n`);

  const scrapers = [
    { name: 'Jobup.ch',      fn: scrapeJobup },
    { name: 'SwissDevJobs',  fn: scrapeSwissDevJobs },
    { name: 'Indeed CH',     fn: scrapeIndeed },
    { name: 'Emploi-IT',     fn: scrapeEmploiIT },
    { name: 'Jobs.ch',       fn: scrapeJobsCH },
  ];

  const results = [];
  let totalJobs = [];

  for (const { name, fn } of scrapers) {
    try {
      console.log(`▶ ${name}...`);
      const jobs = await fn();
      results.push({ name, count: jobs.length, status: 'ok' });
      totalJobs = totalJobs.concat(jobs);
      console.log(`✓ ${name}: ${jobs.length} offres\n`);
    } catch (err) {
      console.error(`✗ ${name}: ${err.message}\n`);
      results.push({ name, count: 0, status: 'error', error: err.message });
    }
  }

  // Dédupliquer globalement (même URL sur différentes sources)
  const seen = new Set();
  const deduped = totalJobs.filter(j => {
    const key = `${j.external_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`\n📊 Résumé:`);
  results.forEach(r => console.log(`  ${r.status === 'ok' ? '✓' : '✗'} ${r.name}: ${r.count} offres`));
  console.log(`  Total: ${deduped.length} offres uniques`);

  if (!IS_TEST) {
    console.log(`\n💾 Sauvegarde dans Supabase...`);
    const { inserted } = await upsertJobs(deduped);
    await markStaleJobsInactive();
    console.log(`✓ ${inserted} offres sauvegardées`);
  } else {
    console.log(`\n[TEST] Exemple d'offre:\n`, JSON.stringify(deduped[0], null, 2));
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⏱ Terminé en ${duration}s`);

  return { total: deduped.length, results };
}

// Lancement direct (node scraper/index.js)
if (require.main === module) {
  runScraper()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Erreur fatale:', err);
      process.exit(1);
    });
}

module.exports = { runScraper };
