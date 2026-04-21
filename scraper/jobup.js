/**
 * scraper/jobup.js - Scraper Jobup.ch via HTML + Cheerio (sans Playwright)
 * Structure réelle: chaque offre = un <a href="/fr/emplois/detail/...">
 * Le texte du lien contient: [date][titre]Lieu de travail:[ville]...[entreprise]
 */
const axios = require('axios');
const cheerio = require('cheerio');

const SOURCE = 'jobup';
const BASE_URL = 'https://www.jobup.ch';

// Mots-clés tech ciblés
const KEYWORDS = ['flutter', 'react', 'nodejs', 'nextjs', 'typescript', 'fullstack', 'mobile developer', 'kotlin', 'swift'];

async function scrapeJobup() {
  const jobs = [];
  const seenUrls = new Set();

  for (const term of KEYWORDS) {
    // Scraper pages 1 et 2 pour chaque terme (14 jours)
    for (let page = 1; page <= 2; page++) {
      const pageParam = page > 1 ? `&page=${page}` : '';
      const url = `${BASE_URL}/fr/emplois/?term=${encodeURIComponent(term)}&publication_date=14${pageParam}`;
      console.log(`[jobup] Scraping: ${url}`);

      try {
        const { data } = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9',
            'Referer': 'https://www.jobup.ch/fr/',
          },
          timeout: 20000,
        });

        const $ = cheerio.load(data);

        // Tous les liens vers des offres d'emploi détaillées
        $('a[href*="/fr/emplois/detail/"]').each((_, el) => {
          const href = $(el).attr('href') || '';
          const fullUrl = href.startsWith('http') ? href : BASE_URL + href;

          if (seenUrls.has(fullUrl)) return;
          seenUrls.add(fullUrl);

          // Extraire le texte brut du lien
          const rawText = $(el).text().trim();
          if (rawText.length < 5) return;

          // Parsing du texte structuré
          const parsed = parseJobupText(rawText, fullUrl);
          if (!parsed) return;

          // Filtre : titre doit contenir un mot-clé tech
          const titleLower = parsed.title.toLowerCase();
          const techKeywords = ['flutter', 'mobile', 'dart', 'react', 'node', 'next', 'fullstack', 'full stack', 'typescript', 'javascript', 'kotlin', 'swift', 'android', 'ios'];
          if (!techKeywords.some(k => titleLower.includes(k))) return;

          const externalId = `jobup_${href.split('/').filter(Boolean).pop()}`;

          jobs.push({
            external_id: externalId,
            source: SOURCE,
            title: parsed.title,
            company: parsed.company,
            city: parsed.city,
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
        console.error(`[jobup] Erreur ${url}: ${err.message}`);
        break; // Si page 1 échoue, pas la peine de chercher page 2
      }
    }
  }

  console.log(`[jobup] ${jobs.length} offres trouvées (${seenUrls.size} URLs uniques visitées)`);
  return jobs;
}

/**
 * Parse le texte brut d'un lien Jobup/Jobs.ch
 * Format: "Il y a Xj[Titre]Lieu de travail:[Ville]Taux d'activité:[%]Type de contrat:[Contrat]Salaire:[CHF]Entreprise"
 */
function parseJobupText(raw, url) {
  // Séparer la date du reste
  const datePatterns = [
    /^(Hier|Aujourd'hui|Nouveau|Il y a \d+ heure[s]?|Il y a \d+ jour[s]?|La semaine dernière|Il y a \d+ semaine[s]?|Le mois dernier|Il y a \d+ mois|Il y a \d+ trimestre[s]?)/i,
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

  // Extraire le titre (tout avant "Lieu de travail:")
  const lieuIdx = rest.indexOf('Lieu de travail:');
  if (lieuIdx === -1) {
    // Pas de structure connue, on tente quand même
    return { title: rest.slice(0, 100).trim(), company: '', city: 'Suisse', contract: '', salary: '', date };
  }

  const title = rest.slice(0, lieuIdx).trim();
  const afterLieu = rest.slice(lieuIdx + 'Lieu de travail:'.length);

  // Extraire ville
  const tauxIdx = afterLieu.indexOf('Taux d\'activité:');
  const cityRaw = tauxIdx !== -1 ? afterLieu.slice(0, tauxIdx).trim() : afterLieu.slice(0, 50).trim();
  const city = extractCity(cityRaw);

  // Extraire contrat
  let contract = '';
  const contratMatch = afterLieu.match(/Type de contrat:([^S]+?)(?:Salaire:|Candidature|$)/);
  if (contratMatch) contract = contratMatch[1].trim();

  // Extraire salaire
  let salary = null;
  const salaireMatch = afterLieu.match(/Salaire:(CHF[^a-z]+)/i);
  if (salaireMatch) salary = salaireMatch[1].trim();

  // Extraire entreprise (à la fin)
  const lastParts = afterLieu.split(/(?:Candidature simplifiée|Nouveau)/).map(s => s.trim());
  const company = lastParts[lastParts.length - 1].replace(/(Durée indéterminée|CDI|CDD|Temporaire|Freelance|Stage|Revenu complémentaire|\d+\s*–\s*\d+%|CHF[\d\s\-]+\/an)/gi, '').trim().slice(-80).trim();

  return { title, company, city, contract, salary, date };
}

function parseDate(dateStr) {
  if (!dateStr) return new Date().toISOString();
  const now = new Date();
  const d = dateStr.toLowerCase();

  if (d.includes('aujourd') || d.includes('heure')) return now.toISOString();
  if (d.includes('hier')) {
    now.setDate(now.getDate() - 1);
    return now.toISOString();
  }

  const dayMatch = d.match(/(\d+)\s+jour/);
  if (dayMatch) {
    now.setDate(now.getDate() - parseInt(dayMatch[1]));
    return now.toISOString();
  }

  const weekMatch = d.match(/(\d+)\s+semaine/);
  if (weekMatch) {
    now.setDate(now.getDate() - parseInt(weekMatch[1]) * 7);
    return now.toISOString();
  }

  if (d.includes('semaine dernière')) {
    now.setDate(now.getDate() - 7);
    return now.toISOString();
  }

  if (d.includes('mois dernier') || d.includes('mois')) {
    now.setMonth(now.getMonth() - 1);
    return now.toISOString();
  }

  return now.toISOString();
}

function extractCity(raw) {
  if (!raw) return 'Suisse';
  const cities = [
    'Genève', 'Lausanne', 'Zürich', 'Zurich', 'Bern', 'Berne', 'Bâle', 'Basel',
    'Zug', 'Zoug', 'Luzern', 'Lucerne', 'St. Gallen', 'Winterthur', 'Neuchâtel',
    'Fribourg', 'Sion', 'Lugano', 'Geneva', 'Nyon', 'Vevey', 'Morges', 'Nidau',
    'Olten', 'Aarau', 'Zollikon', 'Schlieren', 'Thalwil',
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
  if (r.includes('cdd') || r.includes('déterminée') || r.includes('temporaire')) return 'CDD';
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

module.exports = { scrapeJobup };
