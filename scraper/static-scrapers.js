const axios = require('axios');
const cheerio = require('cheerio');

// ─── Emploi-IT ───────────────────────────────────────────────────────────────

async function scrapeEmploiIT() {
  const SOURCE = 'emploi_it';
  const jobs = [];
  const keywords = ['flutter', 'react', 'nodejs', 'nextjs', 'typescript', 'fullstack'];

  for (const kw of keywords) {
    try {
      const url = `https://emploi-it.ch/developpeur?keyword=${encodeURIComponent(kw)}&region=suisse-romande`;
      console.log(`[emploi_it] Scraping ${url}`);

      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'fr-FR,fr;q=0.9',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(data);

      $('article, .job-item, .vacancy, [class*="job-card"], [class*="JobCard"]').each((_, el) => {
        const title = $(el).find('h2, h3, .title, [class*="title"]').first().text().trim();
        const company = $(el).find('.company, [class*="company"], [class*="employer"]').first().text().trim();
        const city = $(el).find('.location, [class*="location"], [class*="city"]').first().text().trim();
        const link = $(el).find('a').first().attr('href') || '';
        const salary = $(el).find('[class*="salary"], [class*="wage"]').first().text().trim();

        if (!title) return;
        
        const titleLower = title.toLowerCase();
        const techKeywords = ['flutter', 'mobile', 'dart', 'react', 'node', 'next', 'fullstack', 'full stack', 'typescript', 'javascript'];
        if (!techKeywords.some(k => titleLower.includes(k))) return;

        const fullUrl = link.startsWith('http') ? link : `https://emploi-it.ch${link}`;
        const externalId = `emploi_it_${Buffer.from(fullUrl).toString('base64').slice(0, 20)}`;

        jobs.push({
          external_id: externalId,
          source: SOURCE,
          title,
          company,
          city: extractCity(city),
          region: 'Suisse romande',
          contract: detectContract(title),
          remote: detectRemote(title + city),
          salary: salary || null,
          url: fullUrl,
          posted_at: new Date().toISOString(),
          tags: extractTags(title),
          scraped_at: new Date().toISOString(),
          is_active: true,
        });
      });
    } catch (err) {
      console.error(`[emploi_it] Erreur for ${kw}: ${err.message}`);
    }
  }

  // Dédupliquer
  const seen = new Set();
  return jobs.filter(j => {
    if (seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });
}

// ─── Jobs.ch ─────────────────────────────────────────────────────────────────

async function scrapeJobsCH() {
  const SOURCE = 'jobs_ch';
  const jobs = [];
  const terms = ['flutter', 'react', 'nodejs', 'nextjs', 'typescript', 'fullstack'];

  for (const term of terms) {
    try {
      // Jobs.ch expose une API JSON non documentée mais publique
      const apiUrl = `https://www.jobs.ch/api/v1/public/search/?term=${encodeURIComponent(term)}&location=suisse-romande&rows=50`;
      console.log(`[jobs_ch] Scraping API ${apiUrl}`);

      const { data } = await axios.get(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.jobs.ch/',
        },
        timeout: 15000,
      });

      const items = data?.documents || data?.results || data?.jobs || [];

      for (const item of items) {
        const title = item.title || item.job_title || '';
        const titleLower = title.toLowerCase();
        const techKeywords = ['flutter', 'mobile', 'dart', 'react', 'node', 'next', 'fullstack', 'full stack', 'typescript', 'javascript'];
        if (!techKeywords.some(k => titleLower.includes(k))) continue;

        const externalId = `jobs_ch_${item.id || item.slug || Buffer.from(title + item.company_name).toString('base64').slice(0, 16)}`;
        const url = item.url || item.apply_url || `https://www.jobs.ch/fr/offres-emplois/${item.slug || item.id}/`;

        jobs.push({
          external_id: externalId,
          source: SOURCE,
          title,
          company: item.company_name || item.company || '',
          city: extractCity(item.location || item.city || ''),
          region: 'Suisse romande',
          contract: item.employment_grade ? 'CDI' : detectContract(title),
          remote: detectRemote(title + (item.location || '')),
          salary: item.salary_range || null,
          url: url.startsWith('http') ? url : `https://www.jobs.ch${url}`,
          posted_at: item.publication_date || item.created_at || new Date().toISOString(),
          tags: extractTags(title),
          scraped_at: new Date().toISOString(),
          is_active: true,
        });
      }
    } catch (err) {
      console.error(`[jobs_ch] Erreur for ${term}: ${err.message}`);
    }
  }

  // Dédupliquer
  const seen = new Set();
  return jobs.filter(j => {
    if (seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });
}

// ─── Helpers partagés ────────────────────────────────────────────────────────

function extractCity(raw) {
  if (!raw) return 'Suisse';
  const cities = ['Genève', 'Lausanne', 'Neuchâtel', 'Fribourg', 'Berne', 'Sion', 'Yverdon', 'Vevey', 'Montreux', 'Nyon', 'Morges', 'Gland', 'Renens'];
  for (const c of cities) {
    if (raw.toLowerCase().includes(c.toLowerCase())) return c;
  }
  if (raw.toLowerCase().includes('remote') || raw.toLowerCase().includes('télétravail')) return 'Remote';
  return raw.split(/[,/]/)[0].trim() || 'Suisse';
}

function detectRemote(text) {
  const t = text.toLowerCase();
  if (t.includes('full remote') || t.includes('100% remote')) return 'Full Remote';
  if (t.includes('remote') || t.includes('hybride') || t.includes('télétravail')) return 'Hybride';
  return 'Sur site';
}

function detectContract(title) {
  const t = title.toLowerCase();
  if (t.includes('freelance') || t.includes('mission')) return 'Freelance';
  if (t.includes('stage') || t.includes('intern')) return 'Stage';
  if (t.includes('cdd') || t.includes('temporaire')) return 'CDD';
  return 'CDI';
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

module.exports = { scrapeEmploiIT, scrapeJobsCH };
