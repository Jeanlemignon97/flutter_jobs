const { chromium } = require('playwright');

const SOURCE = 'jobup';
const BASE_URL = 'https://www.jobup.ch';

async function scrapeJobup() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    locale: 'fr-FR',
  });
  const page = await context.newPage();
  const jobs = [];

  try {
    const searchUrl = `${BASE_URL}/fr/emplois/?term=flutter&region=romandie&region=1&region=2&region=3&region=4`;
    console.log(`[jobup] Scraping ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Attendre que les offres se chargent
    await page.waitForSelector('[data-cy="vacancy-item"], .job-listing-item, article', { timeout: 15000 }).catch(() => {});

    // Extraire les offres
    const rawJobs = await page.evaluate(() => {
      const items = document.querySelectorAll('[data-cy="vacancy-item"], .vacancy-item, article.job-item');
      return Array.from(items).map(el => {
        const titleEl = el.querySelector('h2, h3, [data-cy="vacancy-title"], .job-title');
        const companyEl = el.querySelector('[data-cy="company-name"], .company-name, .employer');
        const cityEl = el.querySelector('[data-cy="location"], .location, .city');
        const linkEl = el.querySelector('a[href*="/emplois/"], a[href*="/fr/emplois/"]');
        const dateEl = el.querySelector('time, .date, [data-cy="publication-date"]');
        const contractEl = el.querySelector('[data-cy="workload"], .contract-type, .job-type');

        return {
          title: titleEl?.textContent?.trim() || '',
          company: companyEl?.textContent?.trim() || '',
          city: cityEl?.textContent?.trim() || '',
          url: linkEl?.href || '',
          date: dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || '',
          contract: contractEl?.textContent?.trim() || '',
        };
      }).filter(j => j.title && j.url);
    });

    for (const raw of rawJobs) {
      if (!raw.title.toLowerCase().includes('flutter') &&
          !raw.title.toLowerCase().includes('mobile') &&
          !raw.title.toLowerCase().includes('dart')) {
        continue;
      }

      const externalId = `jobup_${Buffer.from(raw.url).toString('base64').slice(0, 20)}`;
      jobs.push({
        external_id: externalId,
        source: SOURCE,
        title: raw.title,
        company: raw.company,
        city: extractCity(raw.city),
        region: 'Suisse romande',
        contract: parseContract(raw.contract),
        remote: detectRemote(raw.title + raw.city),
        url: raw.url.startsWith('http') ? raw.url : BASE_URL + raw.url,
        posted_at: raw.date ? new Date(raw.date).toISOString() : new Date().toISOString(),
        tags: extractTags(raw.title),
        scraped_at: new Date().toISOString(),
        is_active: true,
      });
    }

    console.log(`[jobup] ${jobs.length} offres trouvées`);
  } catch (err) {
    console.error(`[jobup] Erreur: ${err.message}`);
  } finally {
    await browser.close();
  }

  return jobs;
}

function extractCity(raw) {
  if (!raw) return 'Suisse';
  const cities = ['Genève', 'Lausanne', 'Neuchâtel', 'Fribourg', 'Berne', 'Sion', 'Yverdon', 'Vevey', 'Montreux', 'Nyon'];
  for (const c of cities) {
    if (raw.toLowerCase().includes(c.toLowerCase())) return c;
  }
  return raw.split(',')[0].trim();
}

function parseContract(raw) {
  if (!raw) return 'CDI';
  const r = raw.toLowerCase();
  if (r.includes('freelance') || r.includes('indépendant')) return 'Freelance';
  if (r.includes('stage') || r.includes('intern')) return 'Stage';
  if (r.includes('cdd') || r.includes('durée déterminée') || r.includes('temporaire')) return 'CDD';
  return 'CDI';
}

function detectRemote(text) {
  const t = text.toLowerCase();
  if (t.includes('full remote') || t.includes('100% remote') || t.includes('télétravail complet')) return 'Full Remote';
  if (t.includes('remote') || t.includes('hybride') || t.includes('télétravail')) return 'Hybride';
  return 'Sur site';
}

function extractTags(title) {
  const tags = [];
  const t = title.toLowerCase();
  if (t.includes('flutter')) tags.push('Flutter');
  if (t.includes('dart')) tags.push('Dart');
  if (t.includes('react native')) tags.push('React Native');
  if (t.includes('node') || t.includes('nodejs')) tags.push('Node.js');
  if (t.includes('firebase')) tags.push('Firebase');
  if (t.includes('kotlin')) tags.push('Kotlin');
  if (t.includes('swift')) tags.push('Swift');
  if (t.includes('senior')) tags.push('Senior');
  if (t.includes('lead')) tags.push('Lead');
  if (t.includes('fullstack') || t.includes('full stack') || t.includes('full-stack')) tags.push('Full Stack');
  if (tags.length === 0) tags.push('Mobile');
  return tags;
}

module.exports = { scrapeJobup };
