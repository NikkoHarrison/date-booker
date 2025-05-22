require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables. Please check your .env.local file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateData() {
  try {
    // Read the local dump file
    const dumpPath = path.join(__dirname, 'local_dump.backup');
    const dumpContent = fs.readFileSync(dumpPath, 'utf8');

    // Split the dump into individual SQL statements
    const statements = dumpContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    console.log(`Found ${statements.length} statements to process`);

    // Process statements in chunks to avoid rate limits
    const chunkSize = 10;
    for (let i = 0; i < statements.length; i += chunkSize) {
      const chunk = statements.slice(i, i + chunkSize);
      console.log(`Processing chunk ${i / chunkSize + 1} of ${Math.ceil(statements.length / chunkSize)}`);

      // Execute each statement in the chunk
      for (const stmt of chunk) {
        try {
          const { error } = await supabase.rpc('exec_sql', { sql: stmt });
          if (error) {
            console.error('Error executing statement:', error);
            console.log('Problematic statement:', stmt);
          }
        } catch (err) {
          console.error('Error executing statement:', err);
          console.log('Problematic statement:', stmt);
        }
      }

      // Add a small delay between chunks
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('Migration completed!');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrateData(); 