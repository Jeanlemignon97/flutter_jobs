/**
 * scraper/static-scrapers.js
 * Jobs.ch : Cheerio + Axios (groupe JobCloud, même structure HTML que Jobup)
 * Emploi-IT est dans scraper/emploi-it.js (Playwright)
 */
const axios = require('axios');
const cheerio = require('cheerio');

const TECH_KEYWORDS = ['flutter', 'mobile', 'dart', 'react', 'node', 'next', 'fullstack', 'full stack', 'typescript', 'javascript', 'kotlin', 'swift', 'android', 'ios'];
const SEARCH_TERMS = ['flutter', 'react', 'nodejs', 'nextjs', 'typescript', 'fullstack', 'mobile developer', 'kotlin'];

// ─── Jobs.ch ─────────────────────────────────────────────────────────────────

async function scrapeJobsCH() {
  const SOURCE = 'jobs_ch';
  const jobs = [];
  const seenUrls = new Set();

  for (const term of SEARCH_TERMS) {
    for (let page = 1; page <= 2; page++) {
      const pageParam = page > 1 ? `&page=${page}` : '';
      const url = `https://www.jobs.ch/fr/offres-emplois/?term=${encodeURIComponent(term)}&publication_date=14${pageParam}`;
      console.log(`[jobs_ch] Scraping: ${url}`);

      try {
        const { data } = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9',
            'Referer': 'https://www.jobs.ch/fr/',
          },
          timeout: 20000,
        });

        const $ = cheerio.load(data);

        // Jobs.ch et Jobup partagent la même structure HTML (groupe JobCloud)
        // Chaque offre = un <a href="/fr/offres-emplois/detail/...">
        $('a[href*="/fr/offres-emplois/detail/"]').each((_, el) => {
          const href = $(el).attr('href') || '';
          const fullUrl = href.startsWith('http') ? href : 'https://www.jobs.ch' + href;

          if (seenUrls.has(fullUrl)) return;
          seenUrls.add(fullUrl);

          const rawText = $(el).text().trim();
          if (rawText.length < 5) return;

          const parsed = parseJobcloudText(rawText);
          if (!parsed) return;

          const titleLower = parsed.title.toLowerCase();
          if (!TECH_KEYWORDS.some(k => titleLower.includes(k))) return;

          const externalId = `jobs_ch_${href.split('/').filter(Boolean).pop()}`;

          jobs.push({
            external_id: externalId,
            source: SOURCE,
            title: parsed.title,
            company: parsed.company,
            city: extractCity(parsed.city),
            region: 'Suisse',
            contract: parseContract(parsed.contract),
            remote: detectRemote(parsed.title + parsed.city),
            salary: parsed.salary || null,
            url: fullUrl,
            posted_at: parseDate(parsed.date),
            tags: extractTags(parsed.title),
            scraped_at: new Date().toISOString(),
            is_active: true,
          });
        });
      } catch (err) {
        console.error(`[jobs_ch] Erreur ${url}: ${err.message}`);
        break;
      }
    }
  }

  console.log(`[jobs_ch] ${jobs.length} offres trouvées`);
  return jobs;
}



// ─── Helpers partagés ────────────────────────────────────────────────────────

/**
 * Parse le texte brut d'un lien Jobup/Jobs.ch (groupe JobCloud)
 */
function parseJobcloudText(raw) {
  const datePatterns = [
    /^(Hier|Aujourd'hui|Nouveau|Il y a \d+ heure[s]?|Il y a \d+ jour[s]?|La semaine dernière|Le mois dernier|Il y a \d+ semaine[s]?|Il y a \d+ mois|Il y a \d+ trimestre[s]?)/i,
  ];

  let date = '';
  let rest = raw;

  for (const pat of datePatterns) {
    const m = raw.match(pat);
    if (m) {
      date = m[1];
      rest = raw.slice(m[0].length).trim();
      break;
    }
  }

  const lieuIdx = rest.indexOf('Lieu de travail:');
  if (lieuIdx === -1) {
    return { title: rest.slice(0, 100).trim(), company: '', city: 'Suisse', contract: '', salary: null, date };
  }

  const title = rest.slice(0, lieuIdx).trim();
  const afterLieu = rest.slice(lieuIdx + 'Lieu de travail:'.length);

  const tauxIdx = afterLieu.indexOf('Taux d\'activité:');
  const cityRaw = tauxIdx !== -1 ? afterLieu.slice(0, tauxIdx).trim() : afterLieu.slice(0, 50).trim();

  let contract = '';
  const contratMatch = afterLieu.match(/Type de contrat:\s*([^S]+?)(?:Salaire:|Candidature|Nouveau|$)/);
  if (contratMatch) contract = contratMatch[1].trim();

  let salary = null;
  const salaireMatch = afterLieu.match(/Salaire:\s*(CHF[^\n]+)/i);
  if (salaireMatch) salary = salaireMatch[1].trim();

  // Entreprise = texte résiduel nettoyé
  const companyRaw = afterLieu
    .replace(/Taux d'activité:[^T]*/i, '')
    .replace(/Type de contrat:[^S]*/i, '')
    .replace(/Salaire:[^\n]*/i, '')
    .replace(/Candidature simplifiée/gi, '')
    .replace(/Nouveau/gi, '')
    .replace(/\d+\s*–\s*\d+%/g, '')
    .replace(/CHF[\d\s\-,./]+\/an/gi, '')
    .trim();
  const company = companyRaw.slice(-80).trim();

  return { title, company, city: cityRaw, contract, salary, date };
}

function parseDate(dateStr) {
  if (!dateStr) return new Date().toISOString();
  const now = new Date();
  const d = dateStr.toLowerCase();
  if (d.includes('aujourd') || d.includes('heure')) return now.toISOString();
  if (d.includes('hier')) { now.setDate(now.getDate() - 1); return now.toISOString(); }
  const dayMatch = d.match(/(\d+)\s+jour/);
  if (dayMatch) { now.setDate(now.getDate() - parseInt(dayMatch[1])); return now.toISOString(); }
  const weekMatch = d.match(/(\d+)\s+semaine/);
  if (weekMatch) { now.setDate(now.getDate() - parseInt(weekMatch[1]) * 7); return now.toISOString(); }
  if (d.includes('semaine dernière')) { now.setDate(now.getDate() - 7); return now.toISOString(); }
  if (d.includes('mois')) { now.setMonth(now.getMonth() - 1); return now.toISOString(); }
  return now.toISOString();
}

function extractCity(raw) {
  if (!raw) return 'Suisse';
  const cities = [
    'Genève', 'Lausanne', 'Zürich', 'Zurich', 'Bern', 'Berne', 'Bâle', 'Basel',
    'Zug', 'Zoug', 'Luzern', 'Lucerne', 'St. Gallen', 'Winterthur', 'Neuchâtel',
    'Fribourg', 'Sion', 'Lugano', 'Geneva', 'Nyon', 'Vevey', 'Morges', 'Nidau',
    'Olten', 'Aarau', 'Pully',
  ];
  for (const c of cities) {
    if (raw.toLowerCase().includes(c.toLowerCase())) return c;
  }
  if (raw.toLowerCase().includes('remote') || raw.toLowerCase().includes('télétravail')) return 'Remote';
  return raw.split(/[,/(]/)[0].trim().slice(0, 30) || 'Suisse';
}

function parseContract(raw) {
  if (!raw) return 'CDI';
  const r = raw.toLowerCase();
  if (r.includes('freelance') || r.includes('indépendant')) return 'Freelance';
  if (r.includes('stage') || r.includes('intern')) return 'Stage';
  if (r.includes('déterminée') || r.includes('temporaire') || r.includes('cdd')) return 'CDD';
  return 'CDI';
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
  if (t.includes('node')) tags.push('Node.js');
  if (t.includes('react') && !t.includes('react native')) tags.push('React');
  if (t.includes('react native')) tags.push('React Native');
  if (t.includes('nextjs') || t.includes('next.js')) tags.push('Next.js');
  if (t.includes('typescript') || t.includes(' ts ')) tags.push('TypeScript');
  if (t.includes('firebase')) tags.push('Firebase');
  if (t.includes('kotlin')) tags.push('Kotlin');
  if (t.includes('swift')) tags.push('Swift');
  if (t.includes('android')) tags.push('Android');
  if (t.includes('ios')) tags.push('iOS');
  if (t.includes('fullstack') || t.includes('full stack') || t.includes('full-stack')) tags.push('Full Stack');
  if (t.includes('senior')) tags.push('Senior');
  if (t.includes('lead') || t.includes('principal')) tags.push('Lead');
  if (tags.length === 0) tags.push('Dev');
  return tags;
}

module.exports = { scrapeJobsCH };
