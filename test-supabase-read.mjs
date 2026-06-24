import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function test() {
  const { data, error } = await supabase.from('tasks').select('*');
  console.log("Tasks in DB:", data);
  if (error) console.error("Error:", error);
}
test();
