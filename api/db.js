require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error('\n❌ ERREUR : SUPABASE_URL ou SUPABASE_KEY manquante dans le .env');
  console.error('Assurez-vous de les avoir configurées sur Render > Environment.\n');
  // On ne bloque pas forcément ici le chargement du module, 
  // mais les appels à supabase échoueront proprement.
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

module.exports = supabase;
