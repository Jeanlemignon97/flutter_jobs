/**
 * scraper/emploi-it.js
 * Emploi-IT bloque les requêtes HTTP classiques (403).
 * Solution : Playwright pour simuler un vrai navigateur.
 */
const { chromium } = require('playwright');

const SOURCE = 'emploi_it';
const BASE_URL = 'https://emploi-it.ch';

const SEARCH_TERMS = ['flutter', 'react', 'nodejs', 'nextjs', 'typescript', 'fullstack', 'kotlin'];
const TECH_KEYWORDS = ['flutter', 'mobile', 'dart', 'react', 'node', 'next', 'fullstack', 'full stack', 'typescript', 'javascript', 'kotlin', 'swift', 'android', 'ios'];
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

async function scrapeEmploiIT() {
  console.log('[emploi_it] Démarrage avec Playwright (contournement 403)...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'fr-CH',
    extraHTTPHeaders: {
      'Accept-Language': 'fr-CH,fr;q=0.9,en;q=0.8',
    },
  });

  const page = await context.newPage();
  const jobs = [];
  const seenUrls = new Set();

  try {
    for (const term of SEARCH_TERMS) {
      const url = `${BASE_URL}/developpeur?keyword=${encodeURIComponent(term)}`;
      console.log(`[emploi_it] Scraping: ${url}`);

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Accepter cookies si popup présent
        const cookieBtn = page.locator('button:has-text("Accepter"), button:has-text("Accept"), #accept-cookies, [class*="cookie"] button').first();
        if (await cookieBtn.isVisible().catch(() => false)) {
          await cookieBtn.click().catch(() => {});
          await page.waitForTimeout(800);
        }

        // Extraire toutes les offres depuis le DOM
        const rawJobs = await page.evaluate((techKeywords) => {
          const results = [];

          // Stratégie 1 : liens contenant /emploi/, /job/, /offre/
          const links = document.querySelectorAll('a[href*="/emploi/"], a[href*="/job/"], a[href*="/offre/"], a[href*="/poste/"]');

          links.forEach(link => {
            const href = link.href || '';
            if (!href) return;

            const container = link.closest('article, .card, [class*="job"], [class*="offer"], li, .item') || link.parentElement;

            const titleEl = container?.querySelector('h1, h2, h3, [class*="title"], [class*="titre"]') || link;
            const title = titleEl?.textContent?.trim() || link.textContent?.trim() || '';
            if (!title || title.length < 5) return;

            const titleLower = title.toLowerCase();
            if (!techKeywords.some(k => titleLower.includes(k))) return;

            const companyEl = container?.querySelector('[class*="company"], [class*="compan"], [class*="entreprise"], [class*="employer"]');
            const cityEl = container?.querySelector('[class*="location"], [class*="city"], [class*="lieu"], [class*="ville"]');
            const dateEl = container?.querySelector('[class*="date"], time');

            results.push({
              title,
              company: companyEl?.textContent?.trim() || '',
              city: cityEl?.textContent?.trim() || '',
              date: dateEl?.textContent?.trim() || dateEl?.getAttribute('datetime') || '',
              url: href,
            });
          });

          // Stratégie 2 : h2/h3 avec lien parent
          if (results.length === 0) {
            document.querySelectorAll('h2, h3').forEach(h => {
              const title = h.textContent?.trim() || '';
              const titleLower = title.toLowerCase();
              if (!techKeywords.some(k => titleLower.includes(k))) return;

              const link = h.querySelector('a') || h.closest('a') || h.parentElement?.querySelector('a');
              const href = link?.href || '';
              if (!href) return;

              const container = h.closest('article, .card, li, [class*="job"], [class*="offer"]') || h.parentElement;
              const companyEl = container?.querySelector('[class*="company"], [class*="entreprise"]');
              const cityEl = container?.querySelector('[class*="location"], [class*="lieu"]');
              const dateEl = container?.querySelector('[class*="date"], time');

              results.push({
                title,
                company: companyEl?.textContent?.trim() || '',
                city: cityEl?.textContent?.trim() || '',
                date: dateEl?.textContent?.trim() || '',
                url: href,
              });
            });
          }

          return results;
        }, TECH_KEYWORDS);

        console.log(`[emploi_it] "${term}": ${rawJobs.length} offres trouvées`);

        const now = Date.now();
        for (const j of rawJobs) {
          if (!j.url || seenUrls.has(j.url)) continue;

          // Filtre 14 jours sur la date si disponible
          if (j.date) {
            const parsed = parseRelativeDate(j.date);
            if (parsed && now - parsed > FOURTEEN_DAYS_MS) continue;
          }

          seenUrls.add(j.url);
          jobs.push({
            external_id: `emploi_it_${Buffer.from(j.url).toString('base64').slice(0, 24)}`,
            source: SOURCE,
            title: j.title,
            company: j.company || '',
            city: extractCity(j.city),
            region: 'Suisse',
            contract: detectContract(j.title),
            remote: detectRemote(j.title + j.city),
            salary: null,
            url: j.url.startsWith('http') ? j.url : `${BASE_URL}${j.url}`,
            posted_at: j.date ? new Date(parseRelativeDate(j.date) || Date.now()).toISOString() : new Date().toISOString(),
            tags: extractTags(j.title),
            scraped_at: new Date().toISOString(),
            is_active: true,
          });
        }

        // Pause courtoise entre requêtes
        await page.waitForTimeout(1500);
      } catch (err) {
        console.error(`[emploi_it] Erreur "${term}": ${err.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`[emploi_it] Total: ${jobs.length} offres retenues`);
  return jobs;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseRelativeDate(str) {
  if (!str) return null;
  const d = str.toLowerCase();
  const now = new Date();
  if (d.includes('aujourd') || d.includes('heure') || d.includes('today')) return now.getTime();
  if (d.includes('hier') || d.includes('yesterday')) return now.getTime() - 86400000;
  const dayMatch = d.match(/(\d+)\s*(jour|day)/);
  if (dayMatch) return now.getTime() - parseInt(dayMatch[1]) * 86400000;
  const weekMatch = d.match(/(\d+)\s*(semaine|week)/);
  if (weekMatch) return now.getTime() - parseInt(weekMatch[1]) * 7 * 86400000;
  if (d.includes('semaine') || d.includes('week')) return now.getTime() - 7 * 86400000;
  // Si c'est une date ISO ou DD.MM.YYYY
  const isoMatch = str.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return new Date(isoMatch[1]).getTime();
  const euMatch = str.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (euMatch) return new Date(`${euMatch[3]}-${euMatch[2]}-${euMatch[1]}`).getTime();
  return null;
}

function extractCity(raw) {
  if (!raw) return 'Suisse';
  const cities = [
    'Genève', 'Lausanne', 'Zürich', 'Zurich', 'Bern', 'Berne', 'Bâle', 'Basel',
    'Zug', 'Zoug', 'Luzern', 'Lucerne', 'St. Gallen', 'Winterthur', 'Neuchâtel',
    'Fribourg', 'Sion', 'Lugano', 'Geneva', 'Nyon', 'Vevey', 'Morges', 'Aarau',
  ];
  for (const c of cities) {
    if (raw.toLowerCase().includes(c.toLowerCase())) return c;
  }
  if (raw.toLowerCase().includes('remote') || raw.toLowerCase().includes('télétravail')) return 'Remote';
  return raw.split(/[,/(]/)[0].trim().slice(0, 30) || 'Suisse';
}

function detectContract(title) {
  const t = title.toLowerCase();
  if (t.includes('freelance') || t.includes('mission')) return 'Freelance';
  if (t.includes('stage') || t.includes('intern')) return 'Stage';
  if (t.includes('cdd') || t.includes('temporaire')) return 'CDD';
  return 'CDI';
}

function detectRemote(text) {
  const t = text.toLowerCase();
  if (t.includes('full remote') || t.includes('100% remote')) return 'Full Remote';
  if (t.includes('remote') || t.includes('hybride') || t.includes('télétravail')) return 'Hybride';
  return 'Sur site';
}

function extractTags(title) {
  const tags = [];
  const t = title.toLowerCase();
  if (t.includes('flutter')) tags.push('Flutter');
  if (t.includes('dart')) tags.push('Dart');
  if (t.includes('react native')) tags.push('React Native');
  else if (t.includes('react')) tags.push('React');
  if (t.includes('node')) tags.push('Node.js');
  if (t.includes('nextjs') || t.includes('next.js')) tags.push('Next.js');
  if (t.includes('typescript')) tags.push('TypeScript');
  if (t.includes('kotlin')) tags.push('Kotlin');
  if (t.includes('swift')) tags.push('Swift');
  if (t.includes('android')) tags.push('Android');
  if (t.includes('ios')) tags.push('iOS');
  if (t.includes('fullstack') || t.includes('full stack')) tags.push('Full Stack');
  if (t.includes('senior')) tags.push('Senior');
  if (t.includes('lead')) tags.push('Lead');
  if (tags.length === 0) tags.push('Dev');
  return tags;
}

module.exports = { scrapeEmploiIT };
