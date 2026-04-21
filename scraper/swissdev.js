/**
 * scraper/swissdev.js
 * Utilise l'API publique https://swissdevjobs.ch/api/jobsLight
 * qui retourne TOUS les jobs suisses en JSON (découverte dans le code source de la SPA React)
 */
const axios = require('axios');

const SOURCE = 'swissdev';
const BASE_URL = 'https://swissdevjobs.ch';

// Catégories techniques et mots-clés ciblés
const TARGET_TECH_CATEGORIES = [
  'Flutter', 'Mobile', 'React', 'JavaScript', 'TypeScript', 'Java', 'Kotlin',
  'Swift', 'Fullstack', 'Node', 'Next', 'Frontend',
];

const TARGET_KEYWORDS = [
  'flutter', 'mobile', 'dart', 'react', 'nodejs', 'node.js', 'next.js', 'nextjs',
  'typescript', 'fullstack', 'full stack', 'full-stack', 'kotlin', 'swift',
  'android', 'ios', 'react native', 'mobile developer',
];

const TARGET_TAGS = [
  'Flutter', 'React', 'NodeJS', 'React Native', 'NextJS', 'TypeScript',
  'JavaScript', 'Kotlin', 'Swift', 'Mobile', 'Fullstack', 'Frontend',
];

// Filtre de 14 jours
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

async function scrapeSwissDevJobs() {
  console.log('[swissdev] Fetching jobs from public API /api/jobsLight...');
  const jobs = [];

  try {
    const { data } = await axios.get(`${BASE_URL}/api/jobsLight`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://swissdevjobs.ch/',
        'Origin': 'https://swissdevjobs.ch',
      },
      timeout: 30000,
    });

    if (!Array.isArray(data)) {
      console.error('[swissdev] Réponse API inattendue (pas un tableau)');
      return [];
    }

    console.log(`[swissdev] ${data.length} jobs reçus depuis l'API`);

    const now = Date.now();

    for (const job of data) {
      // ① Filtre temporel : activeFrom dans les 14 derniers jours
      const activeFrom = job.activeFrom ? new Date(job.activeFrom).getTime() : 0;
      if (now - activeFrom > FOURTEEN_DAYS_MS) continue;

      // ② Filtre tech : techCategory OU technologies OU filterTags OU titre contient un mot-clé
      const title = job.name || '';
      const techCat = job.techCategory || '';
      const technologies = (job.technologies || []).map(t => t.toLowerCase());
      const filterTags = (job.filterTags || []).map(t => t.toLowerCase());
      const titleLower = title.toLowerCase();

      const isTechMatch =
        TARGET_KEYWORDS.some(k => titleLower.includes(k)) ||
        TARGET_TECH_CATEGORIES.some(c => techCat.toLowerCase().includes(c.toLowerCase())) ||
        TARGET_TAGS.some(t => technologies.includes(t.toLowerCase()) || filterTags.includes(t.toLowerCase()));

      if (!isTechMatch) continue;

      // ③ Exclure les offres non suisses (au cas où)
      if (job.isPaused) continue;

      const city = job.actualCity || job.cityCategory || 'Suisse';
      const salary = (job.annualSalaryFrom && job.annualSalaryTo)
        ? `CHF ${job.annualSalaryFrom.toLocaleString()} - ${job.annualSalaryTo.toLocaleString()} /an`
        : null;

      const jobUrl = job.redirectJobUrl || `${BASE_URL}/jobs/${job.techCategory || 'IT'}/${job.jobUrl}`;

      jobs.push({
        external_id: `swissdev_${job._id}`,
        source: SOURCE,
        title,
        company: job.company || '',
        city: extractCity(city),
        region: 'Suisse',
        contract: parseContract(job.jobType),
        remote: detectRemote(job.workplace, title),
        salary,
        url: jobUrl,
        posted_at: job.activeFrom ? new Date(job.activeFrom).toISOString() : new Date().toISOString(),
        tags: extractTags(title, job.technologies || [], job.filterTags || [], techCat),
        scraped_at: new Date().toISOString(),
        is_active: !job.deactivatedOn,
      });
    }
  } catch (err) {
    console.error(`[swissdev] Erreur API: ${err.message}`);
  }

  console.log(`[swissdev] ${jobs.length} offres retenues (14 jours, tech ciblée)`);
  return jobs;
}

function extractCity(raw) {
  if (!raw) return 'Suisse';
  const cities = [
    'Genève', 'Lausanne', 'Zürich', 'Zurich', 'Bern', 'Berne', 'Bâle', 'Basel',
    'Zug', 'Zoug', 'Luzern', 'Lucerne', 'St. Gallen', 'Winterthur', 'Neuchâtel',
    'Fribourg', 'Sion', 'Lugano', 'Geneva', 'Nyon', 'Vevey', 'Morges',
    'Aarau', 'Olten', 'Solothurn', 'Rapperswil', 'Schindellegi',
  ];
  for (const c of cities) {
    if (raw.toLowerCase().includes(c.toLowerCase())) return c;
  }
  if (raw.toLowerCase().includes('remote')) return 'Remote';
  return raw.split(',')[0].trim().slice(0, 40) || 'Suisse';
}

function parseContract(jobType) {
  if (!jobType) return 'CDI';
  const t = jobType.toLowerCase();
  if (t.includes('contract') || t.includes('freelance')) return 'Freelance';
  if (t.includes('internship') || t.includes('stage')) return 'Stage';
  if (t.includes('part-time')) return 'CDI';
  return 'CDI';
}

function detectRemote(workplace, title) {
  const w = (workplace || '').toLowerCase();
  if (w === 'remote') return 'Full Remote';
  if (w === 'hybrid') return 'Hybride';
  const t = title.toLowerCase();
  if (t.includes('remote') || t.includes('télétravail')) return 'Hybride';
  return 'Sur site';
}

function extractTags(title, technologies, filterTags, techCat) {
  const tags = [];
  const t = title.toLowerCase();
  const techs = [...technologies, ...filterTags].map(x => x.toLowerCase());

  if (t.includes('flutter') || techs.includes('flutter')) tags.push('Flutter');
  if (t.includes('dart') || techs.includes('dart')) tags.push('Dart');
  if (t.includes('react native') || techs.includes('react native')) tags.push('React Native');
  if ((t.includes('react') || techs.includes('react')) && !tags.includes('React Native')) tags.push('React');
  if (t.includes('node') || techs.includes('nodejs')) tags.push('Node.js');
  if (t.includes('nextjs') || t.includes('next.js') || techs.includes('nextjs')) tags.push('Next.js');
  if (t.includes('typescript') || techs.includes('typescript')) tags.push('TypeScript');
  if (t.includes('kotlin') || techs.includes('kotlin')) tags.push('Kotlin');
  if (t.includes('swift') || techs.includes('swift')) tags.push('Swift');
  if (t.includes('android') || techs.includes('android')) tags.push('Android');
  if (t.includes('ios') || techs.includes('ios')) tags.push('iOS');
  if (t.includes('fullstack') || t.includes('full stack') || techs.includes('fullstack')) tags.push('Full Stack');
  if (t.includes('firebase') || techs.includes('firebase')) tags.push('Firebase');
  if (t.includes('senior')) tags.push('Senior');
  if (t.includes('lead') || t.includes('principal')) tags.push('Lead');

  if (tags.length === 0) tags.push('Dev');
  return tags;
}

module.exports = { scrapeSwissDevJobs };
