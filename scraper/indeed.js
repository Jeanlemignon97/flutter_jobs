const { chromium } = require('playwright');

const SOURCE = 'indeed';
const BASE_URL = 'https://ch-fr.indeed.com';

async function scrapeIndeed() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    locale: 'fr-CH',
    extraHTTPHeaders: {
      'Accept-Language': 'fr-CH,fr;q=0.9',
    }
  });
  const page = await context.newPage();
  const jobs = [];

  try {
    const queries = [
      { q: 'flutter', l: 'Suisse' },
      { q: 'react', l: 'Suisse' },
      { q: 'nodejs', l: 'Suisse' },
      { q: 'nextjs', l: 'Suisse' },
      { q: 'typescript', l: 'Suisse' },
      { q: 'fullstack', l: 'Suisse' },
      { q: 'mobile developer', l: 'Suisse' },
    ];

    for (const { q, l } of queries) {
      const url = `${BASE_URL}/jobs?q=${encodeURIComponent(q)}&l=${encodeURIComponent(l)}&fromage=14`;
      console.log(`[indeed] Scraping ${url}`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Gérer le popup cookies si présent
      const cookieBtn = page.locator('button[id*="onetrust"], button:has-text("Accepter"), button:has-text("Accept")').first();
      if (await cookieBtn.isVisible().catch(() => false)) {
        await cookieBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
      }

      const rawJobs = await page.evaluate(() => {
        const cards = document.querySelectorAll('[data-jk], .job_seen_beacon, .tapItem, [class*="JobCard"]');
        return Array.from(cards).slice(0, 15).map(el => {
          const titleEl = el.querySelector('[data-testid="jobTitle"] a, h2 a, .jobTitle a');
          const companyEl = el.querySelector('[data-testid="company-name"], .companyName, [class*="company"]');
          const cityEl = el.querySelector('[data-testid="text-location"], .companyLocation, [class*="location"]');
          const salaryEl = el.querySelector('[data-testid="attribute_snippet_testid"], .salary-snippet, [class*="salary"]');
          const dateEl = el.querySelector('[data-testid="myJobsStateDate"], .date, [class*="date"]');
          const jk = el.getAttribute('data-jk') || '';

          return {
            title: titleEl?.textContent?.trim() || '',
            company: companyEl?.textContent?.trim() || '',
            city: cityEl?.textContent?.trim() || '',
            salary: salaryEl?.textContent?.trim() || '',
            date: dateEl?.textContent?.trim() || '',
            url: titleEl?.href || (jk ? `https://ch-fr.indeed.com/viewjob?jk=${jk}` : ''),
            jk,
          };
        }).filter(j => j.title);
      });

      for (const raw of rawJobs) {
      const titleLower = raw.title.toLowerCase();
      const keywords = ['flutter', 'mobile', 'dart', 'react', 'node', 'next', 'fullstack', 'full stack', 'typescript'];
      if (!keywords.some(k => titleLower.includes(k))) continue;

        const externalId = `indeed_${raw.jk || Buffer.from(raw.url).toString('base64').slice(0, 16)}`;

        jobs.push({
          external_id: externalId,
          source: SOURCE,
          title: raw.title,
          company: raw.company,
          city: extractCity(raw.city),
          region: 'Suisse romande',
          contract: 'CDI',
          remote: detectRemote(raw.title + raw.city),
          salary: raw.salary || null,
          url: raw.url.startsWith('http') ? raw.url : BASE_URL + raw.url,
          posted_at: parseDate(raw.date),
          tags: extractTags(raw.title),
          scraped_at: new Date().toISOString(),
          is_active: true,
        });
      }

      // Pause entre requêtes pour éviter le blocage
      await page.waitForTimeout(2000);
    }

    // Dédupliquer
    const seen = new Set();
    const unique = jobs.filter(j => {
      if (seen.has(j.external_id)) return false;
      seen.add(j.external_id);
      return true;
    });

    console.log(`[indeed] ${unique.length} offres trouvées`);
    return unique;
  } catch (err) {
    console.error(`[indeed] Erreur: ${err.message}`);
    return jobs;
  } finally {
    await browser.close();
  }
}

function extractCity(raw) {
  if (!raw) return 'Suisse';
  const cities = ['Genève', 'Lausanne', 'Zürich', 'Zurich', 'Bern', 'Bâle', 'Basel', 'Zug', 'Zoug', 'Luzern', 'Lucerne', 'St. Gallen', 'Winterthur', 'Neuchâtel', 'Fribourg', 'Sion', 'Lugano'];
  for (const c of cities) {
    if (raw.toLowerCase().includes(c.toLowerCase())) return c;
  }
  return raw.split(',')[0].trim();
}

function detectRemote(text) {
  const t = text.toLowerCase();
  if (t.includes('full remote') || t.includes('100% remote')) return 'Full Remote';
  if (t.includes('remote') || t.includes('hybride') || t.includes('télétravail')) return 'Hybride';
  return 'Sur site';
}

function parseDate(raw) {
  if (!raw) return new Date().toISOString();
  if (raw.includes('aujourd') || raw.includes('today') || raw.includes('1 day')) {
    return new Date().toISOString();
  }
  const match = raw.match(/(\d+)/);
  if (match) {
    const days = parseInt(match[1]);
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }
  return new Date().toISOString();
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

module.exports = { scrapeIndeed };
