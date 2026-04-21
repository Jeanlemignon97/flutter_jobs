/**
 * Script de diagnostic – détecte les vrais sélecteurs HTML des sites de jobs
 * Usage: node scraper/diagnose.js
 */
const { chromium } = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');

async function dumpPageInfo(page, url, name) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`▶ ${name} — ${url}`);
  console.log('='.repeat(60));

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const info = await page.evaluate(() => {
    // Cherche les éléments répétitifs qui ressemblent à des offres d'emploi
    const candidates = [
      'article', 'li[class*="job"]', 'li[class*="vacancy"]', 'li[class*="result"]',
      'div[class*="job-card"]', 'div[class*="JobCard"]', 'div[class*="job-item"]',
      'div[class*="vacancy"]', 'div[class*="result-item"]', 'div[class*="listing"]',
      '[data-cy*="vacancy"]', '[data-testid*="job"]', '[class*="JobListing"]',
    ];

    const results = {};
    for (const sel of candidates) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        results[sel] = {
          count: els.length,
          sample: els[0].outerHTML.slice(0, 800),
          firstText: els[0].textContent.slice(0, 200).trim(),
        };
      }
    }

    // Dump also the title, <main> or large containers
    const main = document.querySelector('main, [role="main"], #main-content');
    const mainClasses = main ? main.className : 'N/A';
    const mainChildren = main
      ? Array.from(main.children)
          .slice(0, 5)
          .map(c => `<${c.tagName.toLowerCase()} class="${c.className}">`)
      : [];

    return { candidates: results, mainClasses, mainChildren };
  });

  if (Object.keys(info.candidates).length === 0) {
    console.log('⚠ Aucun élément job trouvé avec les sélecteurs communs');
    console.log('Main container classes:', info.mainClasses);
    console.log('Main children:', info.mainChildren);
  } else {
    for (const [sel, data] of Object.entries(info.candidates)) {
      console.log(`\n✓ Sélecteur: "${sel}" → ${data.count} éléments trouvés`);
      console.log(`  Texte: ${data.firstText.slice(0, 100)}`);
      console.log(`  HTML: ${data.sample.slice(0, 300)}`);
    }
  }
}

async function diagnosejobsCH() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('▶ Jobs.ch API diagnosis');
  console.log('='.repeat(60));

  // Test different API endpoints
  const apiCandidates = [
    'https://www.jobs.ch/api/v1/public/search/?term=flutter&location=8001&rows=10',
    'https://www.jobs.ch/api/v1/public/search/?term=flutter&rows=10',
    'https://www.jobs.ch/api/v2/jobs/search?q=flutter&rows=10',
    'https://api.jobs.ch/jobs?query=flutter&rows=10',
  ];

  for (const url of apiCandidates) {
    try {
      const { data, status } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          'Accept': 'application/json',
          'Referer': 'https://www.jobs.ch/',
        },
        timeout: 10000,
      });
      console.log(`✓ ${url} → HTTP ${status}`);
      console.log('  Keys:', JSON.stringify(Object.keys(data)));
      if (Array.isArray(data.documents)) console.log('  documents:', data.documents.length);
      if (Array.isArray(data.results)) console.log('  results:', data.results.length);
      break;
    } catch (e) {
      console.log(`✗ ${url} → ${e.response?.status || e.message}`);
    }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await dumpPageInfo(page, 'https://www.jobup.ch/fr/emplois/?term=react&publication_date=14', 'Jobup.ch');
    await dumpPageInfo(page, 'https://swissdevjobs.ch/jobs/Flutter/All', 'SwissDevJobs');
    await diagnosejobsCH();
  } finally {
    await browser.close();
  }

  console.log('\n✅ Diagnostic terminé');
}

main().catch(console.error);
