require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error('\n❌ CRITICAL ERROR: SUPABASE_URL or SUPABASE_KEY is missing!');
  console.error('Check your Render Dashboard > Environment settings.\n');
  // On ne crash pas le processus ici pour permettre au serveur d'afficher des logs 
  // mais on exporte un client qui pourra être identifié comme "non configuré"
}

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'placeholder';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
