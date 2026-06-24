import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function test() {
  console.log("Testing with null userId");
  
  const { data, error } = await supabase.from('tasks').upsert({
    id: 'test-null',
    userId: null,
    task_data: { title: 'Test Task' },
    updatedAt: new Date().toISOString()
  });
  
  console.log("Result:", { data, error });
}
test();
