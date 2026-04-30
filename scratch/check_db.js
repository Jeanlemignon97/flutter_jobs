const supabase = require('./api/db');

async function checkData() {
  const { data, error } = await supabase
    .from('jobs')
    .select('title, scraped_at, posted_at')
    .limit(10);
  
  if (error) {
    console.error(error);
    return;
  }
  
  console.log('Sample data:');
  data.forEach(j => {
    console.log(`- ${j.title} | Scraped: ${j.scraped_at} | Posted: ${j.posted_at}`);
  });

  const now = Date.now();
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`\nThree days ago threshold: ${threeDaysAgo}`);

  const { count: newCount } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .gte('scraped_at', threeDaysAgo);
  
  const { count: oldCount } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .lt('scraped_at', threeDaysAgo);

  console.log(`\nStats:`);
  console.log(`New (< 3j): ${newCount}`);
  console.log(`Old (> 3j): ${oldCount}`);
}

checkData();
