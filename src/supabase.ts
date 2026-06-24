import { createClient, User } from "@supabase/supabase-js";
import { Task } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder";

export const isSupabaseConfigured = supabaseUrl !== "https://placeholder.supabase.co";

export async function checkSupabaseConnection(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.from('tasks').select('id').limit(1);
    return !error;
  } catch (e) {
    return false;
  }
}

if (!isSupabaseConfigured) {
  console.error("Supabase URL is missing! Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your Secrets.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const auth = {
  onAuthStateChanged: (callback: (user: User | null) => void) => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      callback(session?.user ?? null);
    });
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user ?? null);
    });
    
    return () => {
      subscription.unsubscribe();
    };
  },
  get currentUser(): User | null {
    // Synchronous get is not perfectly supported without reading local session
    // We'll return null or the session user if possible, but preferably async
    return null;
  }
};

let cachedAccessToken: string | null = null;

export const getSafeRedirectUrl = (): string => {
  const origin = window.location.origin;
  if (origin.includes("ais-dev-")) {
    return origin.replace("ais-dev-", "ais-pre-");
  }
  return origin;
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    // If the app is rendered in an iframe (e.g. within AI Studio's preview panel),
    // browser cookies and Google's X-Frame-Options headers will block Google OAuth from loading, resulting in a 403 or blank page.
    // We detect if we are in an iframe, and if so, use 'skipBrowserRedirect: true' to retrieve
    // the auth URL and open it in a new, un-sandboxed tab/popup.
    const isInIframe = window.self !== window.top;
    const redirectUrl = getSafeRedirectUrl();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: isInIframe,
      }
    });

    if (error) throw error;

    if (isInIframe && data?.url) {
      const popup = window.open(data.url, '_blank');
      if (!popup) {
        // Fallback: if browser blocked popup, try top-level redirect if permitted
        try {
          window.top!.location.href = data.url;
        } catch (e) {
          // If cross-origin restrictions block window.top, use standard iframe redirect
          window.location.href = data.url;
        }
      }
    }

    return null; // Redirect is initiated
  } catch (error) {
    console.error("Google login failed:", error);
    throw error;
  }
};

export const logoutGoogle = async () => {
  await supabase.auth.signOut();
  cachedAccessToken = null;
  localStorage.removeItem("nudge_gcal_connected");
};

export const getAccessToken = (): string | null => {
  // Try to get from supabase session
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.provider_token) {
      cachedAccessToken = session.provider_token;
    }
  });
  return cachedAccessToken;
};

// Anonymous fallback
export async function signInUserAnonymously(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;
  
  // Try anonymous auth if enabled on supabase
  const { data, error } = await supabase.auth.signInAnonymously();
  if (!error && data.user) return data.user.id;
  
  console.warn("Anonymous auth disabled or failed. Falling back to local ID.", error);
  let localId = localStorage.getItem("nudge_user_id");
  if (!localId) {
    localId = `user-fallback-${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem("nudge_user_id", localId);
  }
  return localId;
}

export function subscribeToTasks(userId: string, callback: (tasks: Task[]) => void): () => void {
  // Initial fetch
  getTasks(userId).then(callback);

  const channel = supabase
    .channel('public:tasks')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `userId=eq.${userId}` }, payload => {
      getTasks(userId).then(callback); // Simplify by refetching, or apply delta
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function getTasks(userId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('userId', userId);
    
  if (error) {
    console.error("Error reading tasks from Supabase:", error);
    return [];
  }
  
  return (data || []).map(row => ({
    ...row.task_data,
    id: row.id,
    userId: row.userId
  })) as Task[];
}

export async function saveTask(userId: string, task: Task): Promise<void> {
  // Ensure we extract id to be primary key, and store rest in task_data or split them
  // We'll store them all in JSONb 'task_data' to be flexible, plus id, userId
  const { error } = await supabase
    .from('tasks')
    .upsert({
      id: task.id,
      userId: userId,
      task_data: task,
      updatedAt: new Date().toISOString()
    });
    
  if (error) {
    console.error("Error saving task in Supabase:", error);
    throw error;
  }
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('userId', userId);
    
  if (error) {
    console.error("Error deleting task in Supabase:", error);
    throw error;
  }
}

export async function getUserProfile(userId: string): Promise<{ userName: string } | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('userId', userId)
    .single();
    
  if (error || !data) return null;
  return { userName: data.userName };
}

export async function saveUserProfile(userId: string, userName: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .upsert({
      userId,
      userName,
      updatedAt: new Date().toISOString()
    });
    
  if (error) {
    console.error("Error saving user profile in Supabase:", error);
    throw error;
  }
}
