import { createClient, User } from "@supabase/supabase-js";
import { Task } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder";

export const isSupabaseConfigured = supabaseUrl !== "https://placeholder.supabase.co" && !!import.meta.env.VITE_SUPABASE_URL;

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
  console.log("Using browser Local Storage. VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not configured.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const auth = {
  onAuthStateChanged: (callback: (user: User | null) => void) => {
    if (!isSupabaseConfigured) {
      // Simulate no authenticated user for local mode
      setTimeout(() => callback(null), 10);
      return () => {};
    }
    
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
  if (!isSupabaseConfigured) {
    alert("Google Sign-In requires Supabase database keys to be configured in your workspace Settings.");
    return null;
  }
  try {
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
        try {
          window.top!.location.href = data.url;
        } catch (e) {
          window.location.href = data.url;
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Google login failed:", error);
    throw error;
  }
};

export const logoutGoogle = async () => {
  if (isSupabaseConfigured) {
    await supabase.auth.signOut();
  }
  cachedAccessToken = null;
  localStorage.removeItem("nudge_gcal_connected");
};

export const getAccessToken = (): string | null => {
  if (isSupabaseConfigured) {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.provider_token) {
        cachedAccessToken = session.provider_token;
      }
    });
  }
  return cachedAccessToken;
};

// Anonymous fallback
export async function signInUserAnonymously(): Promise<string> {
  // If the user has a valid Supabase session, return their ID
  if (isSupabaseConfigured) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) return session.user.id;
    } catch (e) {
      // Ignore session errors
    }
  }
  
  // Directly fall back to local ID to avoid annoying console warnings
  // when Anonymous Auth is not explicitly enabled in the Supabase dashboard
  let localId = localStorage.getItem("nudge_user_id");
  if (!localId) {
    localId = `user-local-${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem("nudge_user_id", localId);
  }
  return localId;
}

// Simple in-memory listeners for local storage changes
type Subscriber = (tasks: Task[]) => void;
const subscribers = new Map<string, Set<Subscriber>>();

function notifySubscribers(userId: string) {
  const userSubs = subscribers.get(userId);
  if (userSubs) {
    getTasks(userId).then(tasks => {
      userSubs.forEach(cb => cb(tasks));
    });
  }
}

// Local storage helper
const getLocalTasks = (userId: string): Task[] => {
  try {
    const data = localStorage.getItem(`nudge_tasks_${userId}`);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Error reading local tasks:", e);
    return [];
  }
};

const saveLocalTasks = (userId: string, tasks: Task[]) => {
  try {
    localStorage.setItem(`nudge_tasks_${userId}`, JSON.stringify(tasks));
  } catch (e) {
    console.error("Error saving local tasks:", e);
  }
};

export function subscribeToTasks(userId: string, callback: (tasks: Task[]) => void): () => void {
  // Register the local callback first
  if (!subscribers.has(userId)) {
    subscribers.set(userId, new Set());
  }
  subscribers.get(userId)!.add(callback);

  // Trigger initial callback with local tasks immediately for instant load
  const localTasks = getLocalTasks(userId);
  callback(localTasks);

  // Also trigger fetch from Supabase to sync if online
  getTasks(userId).then(callback);

  let channel: any = null;
  if (isSupabaseConfigured) {
    try {
      channel = supabase
        .channel(`public:tasks:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `userId=eq.${userId}` }, () => {
          getTasks(userId).then(tasks => {
            callback(tasks);
            const userSubs = subscribers.get(userId);
            if (userSubs) {
              userSubs.forEach(cb => {
                if (cb !== callback) cb(tasks);
              });
            }
          });
        })
        .subscribe();
    } catch (e) {
      console.error("Failed to establish Supabase real-time channel:", e);
    }
  }

  // Monitor storage events for multi-tab synchronization
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === `nudge_tasks_${userId}`) {
      const tasks = getLocalTasks(userId);
      callback(tasks);
    }
  };
  window.addEventListener("storage", handleStorageChange);

  return () => {
    const userSubs = subscribers.get(userId);
    if (userSubs) {
      userSubs.delete(callback);
      if (userSubs.size === 0) {
        subscribers.delete(userId);
      }
    }
    window.removeEventListener("storage", handleStorageChange);
    if (channel) {
      try {
        supabase.removeChannel(channel);
      } catch (e) {}
    }
  };
}

export async function getTasks(userId: string): Promise<Task[]> {
  const localTasks = getLocalTasks(userId);
  
  if (!isSupabaseConfigured) {
    return localTasks;
  }
  
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('userId', userId);
      
    if (error) {
      console.warn("Error reading tasks from Supabase, using local fallback:", error);
      return localTasks;
    }
    
    const dbTasks = (data || []).map(row => ({
      ...row.task_data,
      id: row.id,
      userId: row.userId
    })) as Task[];
    
    saveLocalTasks(userId, dbTasks);
    return dbTasks;
  } catch (e) {
    console.warn("Exception reading tasks from Supabase, using local fallback:", e);
    return localTasks;
  }
}

export async function saveTask(userId: string, task: Task): Promise<void> {
  const localTasks = getLocalTasks(userId);
  const existingIndex = localTasks.findIndex(t => t.id === task.id);
  if (existingIndex >= 0) {
    localTasks[existingIndex] = task;
  } else {
    localTasks.push(task);
  }
  saveLocalTasks(userId, localTasks);
  notifySubscribers(userId);

  if (!isSupabaseConfigured) return;

  try {
    const { error } = await supabase
      .from('tasks')
      .upsert({
        id: task.id,
        userId: userId,
        task_data: task,
        updatedAt: new Date().toISOString()
      });
      
    if (error) {
      console.error("Error saving task to Supabase:", error);
    }
  } catch (e) {
    console.error("Exception saving task to Supabase:", e);
  }
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  const localTasks = getLocalTasks(userId);
  const filtered = localTasks.filter(t => t.id !== taskId);
  saveLocalTasks(userId, filtered);
  notifySubscribers(userId);

  if (!isSupabaseConfigured) return;

  try {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId)
      .eq('userId', userId);
      
    if (error) {
      console.error("Error deleting task from Supabase:", error);
    }
  } catch (e) {
    console.error("Exception deleting task from Supabase:", e);
  }
}

export async function getUserProfile(userId: string): Promise<{ userName: string } | null> {
  const localName = localStorage.getItem(`nudge_username_${userId}`);
  
  if (!isSupabaseConfigured) {
    return localName ? { userName: localName } : null;
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('userId', userId)
      .single();
      
    if (error || !data) {
      return localName ? { userName: localName } : null;
    }
    
    if (data.userName) {
      localStorage.setItem(`nudge_username_${userId}`, data.userName);
      return { userName: data.userName };
    }
    return null;
  } catch (e) {
    return localName ? { userName: localName } : null;
  }
}

export async function saveUserProfile(userId: string, userName: string): Promise<void> {
  localStorage.setItem(`nudge_username_${userId}`, userName);
  
  if (!isSupabaseConfigured) return;

  try {
    const { error } = await supabase
      .from('users')
      .upsert({
        userId,
        userName,
        updatedAt: new Date().toISOString()
      });
      
    if (error) {
      console.error("Error saving user profile to Supabase:", error);
    }
  } catch (e) {
    console.error("Exception saving user profile to Supabase:", e);
  }
}
