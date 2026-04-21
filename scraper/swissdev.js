const { chromium } = require('playwright');

const SOURCE = 'swissdev';
const BASE_URL = 'https://swissdevjobs.ch';

async function scrapeSwissdev() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  });
  const page = await context.newPage();
  const jobs = [];

  try {
    const urls = [
      `${BASE_URL}/fr/jobs/Flutter/all`,
      `${BASE_URL}/fr/jobs/Mobile/all`,
      `${BASE_URL}/fr/jobs/React/all`,
      `${BASE_URL}/fr/jobs/Node.js/all`,
      `${BASE_URL}/fr/jobs/TypeScript/all`,
      `${BASE_URL}/fr/jobs/JavaScript/all`,
    ];

    for (const url of urls) {
      console.log(`[swissdev] Scraping ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      const rawJobs = await page.evaluate(() => {
        const cards = document.querySelectorAll('.job-card, [class*="JobCard"], [class*="job-item"], .card');
        return Array.from(cards).map(el => {
          const titleEl = el.querySelector('h2, h3, [class*="title"], [class*="Title"]');
          const companyEl = el.querySelector('[class*="company"], [class*="Company"], [class*="employer"]');
          const locationEl = el.querySelector('[class*="location"], [class*="Location"], [class*="city"]');
          const salaryEl = el.querySelector('[class*="salary"], [class*="Salary"]');
          const linkEl = el.querySelector('a');
          const tagsEl = el.querySelectorAll('[class*="tag"], [class*="Tag"], [class*="badge"], [class*="skill"]');

          return {
            title: titleEl?.textContent?.trim() || '',
            company: companyEl?.textContent?.trim() || '',
            location: locationEl?.textContent?.trim() || '',
            salary: salaryEl?.textContent?.trim() || '',
            url: linkEl?.href || '',
            tags: Array.from(tagsEl).map(t => t.textContent.trim()).filter(Boolean),
          };
        }).filter(j => j.title && j.url);
      });

      for (const raw of rawJobs) {
        const externalId = `swissdev_${Buffer.from(raw.url).toString('base64').slice(0, 20)}`;
        const city = extractCity(raw.location);

        // Filtrer uniquement Suisse romande
        const romandeCities = ['genève', 'lausanne', 'neuchâtel', 'fribourg', 'berne', 'sion', 'vaud', 'valais', 'jura', 'vevey', 'nyon', 'yverdon'];
        const isRomande = romandeCities.some(c => raw.location.toLowerCase().includes(c)) || raw.location === '' || raw.location.toLowerCase().includes('remote');

        if (!isRomande) continue;

        jobs.push({
          external_id: externalId,
          source: SOURCE,
          title: raw.title,
          company: raw.company,
          city,
          region: 'Suisse romande',
          contract: 'CDI',
          remote: detectRemote(raw.title + raw.location),
          salary: raw.salary || null,
          url: raw.url.startsWith('http') ? raw.url : BASE_URL + raw.url,
          posted_at: new Date().toISOString(),
          tags: raw.tags.length > 0 ? raw.tags : extractTags(raw.title),
          scraped_at: new Date().toISOString(),
          is_active: true,
        });
      }
    }

    // Dédupliquer par external_id
    const seen = new Set();
    const unique = jobs.filter(j => {
      if (seen.has(j.external_id)) return false;
      seen.add(j.external_id);
      return true;
    });

    console.log(`[swissdev] ${unique.length} offres trouvées`);
    return unique;
  } catch (err) {
    console.error(`[swissdev] Erreur: ${err.message}`);
    return jobs;
  } finally {
    await browser.close();
  }
}

function extractCity(raw) {
  if (!raw) return 'Suisse';
  const cities = ['Genève', 'Lausanne', 'Neuchâtel', 'Fribourg', 'Berne', 'Sion', 'Yverdon', 'Vevey', 'Montreux', 'Nyon', 'Morges'];
  for (const c of cities) {
    if (raw.toLowerCase().includes(c.toLowerCase())) return c;
  }
  if (raw.toLowerCase().includes('remote')) return 'Remote';
  return raw.split(',')[0].trim();
}

function detectRemote(text) {
  const t = text.toLowerCase();
  if (t.includes('full remote') || t.includes('100% remote')) return 'Full Remote';
  if (t.includes('remote') || t.includes('hybride')) return 'Hybride';
  return 'Sur site';
}

function extractTags(title) {
  const tags = [];
  const t = title.toLowerCase();
  
  if (t.includes('flutter')) tags.push('Flutter');
  if (t.includes('dart')) tags.push('Dart');
  if (t.includes('node')) tags.push('Node.js');
  if (t.includes('react') && !t.includes('react native')) tags.push('React');
  if (t.includes('react native')) tags.push('React Native');
  if (t.includes('nextjs') || t.includes('next.js')) tags.push('Next.js');
  if (t.includes('typescript') || t.includes(' ts ')) tags.push('TypeScript');
  if (t.includes('firebase')) tags.push('Firebase');
  if (t.includes('kotlin')) tags.push('Kotlin');
  if (t.includes('swift')) tags.push('Swift');
  if (t.includes('fullstack') || t.includes('full stack') || t.includes('full-stack')) tags.push('Full Stack');
  if (t.includes('senior')) tags.push('Senior');
  if (t.includes('lead') || t.includes('principal')) tags.push('Lead');
  
  if (tags.length === 0) tags.push('Dev');
  return tags;
}

module.exports = { scrapeSwissdev };
