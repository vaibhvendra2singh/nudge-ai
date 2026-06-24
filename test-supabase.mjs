import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function test() {
  console.log("Testing connection to:", process.env.VITE_SUPABASE_URL);
  
  const { data, error } = await supabase.from('tasks').upsert({
    id: 'test-id',
    userId: 'test-user',
    task_data: { title: 'Test Task' },
    updatedAt: new Date().toISOString()
  });
  
  console.log("Result:", { data, error });
}
test();
