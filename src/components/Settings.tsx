import React, { useState, useEffect } from "react";
import { Task } from "../types";
import { signInUserAnonymously, getTasks, saveTask, googleSignIn, logoutGoogle, auth, getSafeRedirectUrl, isSupabaseConfigured } from "../supabase";

interface SettingsProps {
  userName: string;
  onUpdateUserName: (name: string) => void;
  onClearAllTasks: () => void;
  totalTasksCount: number;
}

export default function Settings({
  userName,
  onUpdateUserName,
  onClearAllTasks,
  totalTasksCount,
}: SettingsProps) {
  const [nameInput, setNameInput] = useState(userName);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user: any) => {
      if (!user) {
        setIsGoogleSignedIn(false);
        setUserEmail(null);
        return;
      }
      // Robust detection for Google / non-anonymous social logins
      const isAnon = user.is_anonymous === true;
      const isGoogleProvider = user.app_metadata?.provider === "google" || 
                               (user.identities && user.identities.some((id: any) => id.provider === "google"));
      const hasEmail = !!user.email && !user.email.endsWith("@anonymous.supabase.co");
      const signedIn = !isAnon && (isGoogleProvider || hasEmail);
      
      setIsGoogleSignedIn(signedIn);
      setUserEmail(signedIn ? user.email : null);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setGoogleError(null);
    try {
      await googleSignIn();
    } catch (e: any) {
      console.error("Google sign in failed", e);
      const msg = e?.message || String(e);
      if (msg.includes("provider is not enabled") || msg.includes("Unsupported provider")) {
        setGoogleError("Google Sign-In is not enabled yet in your Supabase Auth Providers dashboard. In your Supabase project console (Authentication -> Providers -> Google), ensure 'Enable Sign in with Google' is turned ON and you have clicked the 'Save' button at the bottom of the card.");
      } else {
        setGoogleError(`Google auth error: ${msg}. If you're using the embedded AI Studio preview panel, please try clicking 'Open in new tab' to authenticate.`);
      }
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await logoutGoogle();
      window.location.reload();
    } catch (e) {
      console.error("Google sign out failed", e);
    }
  };

  // Diagnostics & endpoint check
  const [healthStatus, setHealthStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [healthMessage, setHealthMessage] = useState("");
  const [latency, setLatency] = useState<number | null>(null);



  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim()) {
      onUpdateUserName(nameInput.trim());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  const checkApiHealth = async () => {
    setHealthStatus("testing");
    setHealthMessage("Pinging node server health verify endpoint...");
    const start = performance.now();
    try {
      const res = await fetch("/api/health");
      const end = performance.now();
      if (!res.ok) throw new Error(`HTTP status error: ${res.status}`);
      const data = await res.json();
      if (data.status === "ok") {
        setHealthStatus("ok");
        setLatency(Math.round(end - start));
        setHealthMessage("Google AI Studio connection proxy established successfully! Gemini API is live.");
      } else {
        throw new Error("Invalid status payload returned from active node service.");
      }
    } catch (err: any) {
      console.error(err);
      setHealthStatus("error");
      setLatency(null);
      setHealthMessage(err.message || "Endpoint host responded with severe fault. Check environment variables.");
    }
  };



  return (
    <div className="w-full space-y-6 animate-fade-in text-left pb-32 max-w-2xl mx-auto">
      {/* Header bar */}
      <section className="space-y-1 border-b border-slate-200 pb-4">
        <h2 className="font-headline text-xl sm:text-2xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
          <span className="material-symbols-outlined text-[26px]">tune</span>
          Settings & Diagnostics
        </h2>
      </section>

      {/* User Customization Card */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-slate-800">
          <span className="material-symbols-outlined text-lg">person</span>
          <h3 className="font-headline text-sm font-bold uppercase tracking-wider">
            1. Identity Configuration
          </h3>
        </div>
        <form onSubmit={handleSaveName} className="space-y-3">
          <div className="flex gap-2 max-w-md">
              <input
              id="username-field"
              type="text"
              required
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 text-base sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black w-full"
              placeholder="e.g. User"
            />
            <button
              type="submit"
              className="bg-slate-900 text-white font-mono text-xs uppercase px-4 py-2 font-bold rounded-lg cursor-pointer hover:bg-slate-800 active:scale-95 transition-all shadow-sm flex-shrink-0"
            >
              Update ID
            </button>
          </div>
          {saveSuccess && (
            <p className="text-black font-mono text-xs uppercase tracking-wider font-bold">
              ✓ Workspace identity updated!
            </p>
          )}
        </form>
      </section>

      {/* Cross-Device Sync Card */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-slate-800">
          <span className="material-symbols-outlined text-lg">sync</span>
          <h3 className="font-headline text-sm font-bold uppercase tracking-wider">
            2. Cross-Device Synchronization
          </h3>
        </div>
        
        <p className="text-xs text-slate-600 leading-relaxed font-body">
          Connect your Google account to back up and synchronize your tasks, productivity streaks, badges, and AI plan timelines securely across all your devices in real-time.
        </p>

        {isSupabaseConfigured ? (
          <div className="space-y-4 pt-1">
            {isGoogleSignedIn ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="space-y-1">
                  <p className="text-emerald-800 text-sm font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Connected with Google
                  </p>
                  {userEmail && (
                    <p className="text-xs text-slate-500 font-mono">{userEmail}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleGoogleSignOut}
                  className="bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 font-mono text-xs uppercase px-4 py-2 border border-slate-200 hover:border-rose-200 font-bold rounded-lg cursor-pointer active:scale-95 transition-all shadow-sm flex-shrink-0"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="flex items-center justify-center gap-2 w-full sm:w-auto bg-white hover:bg-slate-50 text-slate-800 font-sans text-sm font-semibold px-4 py-2.5 border border-slate-300 rounded-lg shadow-sm hover:border-slate-400 active:scale-95 transition-all cursor-pointer"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.61c-.3 1.5-1.11 2.77-2.39 3.62v3h3.86c2.26-2.09 3.66-5.17 3.66-8.82z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.86-3c-1.08.72-2.45 1.16-4.1 1.16-3.15 0-5.81-2.13-6.76-5.01H1.32v3.1A11.977 11.977 0 0012 24z"/>
                    <path fill="#FBBC05" d="M5.24 14.24c-.25-.72-.39-1.5-.39-2.3 0-.8.14-1.58.39-2.3V6.54H1.32A11.944 11.944 0 000 12c0 1.92.45 3.74 1.32 5.37l3.92-3.13z"/>
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.96 1.19 15.24 0 12 0 7.33 0 3.32 2.69 1.32 6.54l3.92 3.1c.95-2.88 3.61-5.01 6.76-5.01z"/>
                  </svg>
                  <span>Sign in with Google</span>
                </button>
                {googleError && (
                  <p className="text-rose-600 font-mono text-[11px] leading-relaxed max-w-md bg-rose-50 border border-rose-100 p-2.5 rounded-lg">
                    {googleError}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-2">
            <div className="flex items-center gap-1.5 text-amber-600 font-bold text-xs uppercase font-mono">
              <span className="material-symbols-outlined text-sm">info_outline</span>
              <span>Local Storage Active</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed font-body">
              Nudge is operating in local-only mode. All tasks and statistics are stored securely in your browser's local cache.
            </p>
            <p className="text-xs text-indigo-600 font-medium font-sans">
              To enable cloud-powered cross-device sync and Google Sign-In, configure the <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold text-[10px]">VITE_SUPABASE_URL</code> and <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold text-[10px]">VITE_SUPABASE_ANON_KEY</code> credentials in your workspace settings.
            </p>
          </div>
        )}
      </section>

      {/* Dangerous Wipe controls */}
      <section className="space-y-4">
        <h3 className="font-headline text-sm font-bold uppercase text-slate-500 tracking-wider">
          3. Dangerous Cache PURGE
        </h3>

        <div className="grid grid-cols-1 gap-4 pt-1">
          {/* Wipe Cache */}
          <div className="p-4 bg-zinc-100 border border-zinc-200 rounded-xl space-y-3 flex flex-col justify-between shadow-sm">
            <div>
              <p className="font-mono text-[10px] text-zinc-650 uppercase font-bold">Dangerous Actions</p>
            </div>
            {showWipeConfirm ? (
              <div className="space-y-2">
                <p className="font-mono text-[10px] text-zinc-800 font-bold uppercase text-center">IRREVERSIBLE! Purge all?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      onClearAllTasks();
                      setShowWipeConfirm(false);
                    }}
                    className="flex-1 bg-black hover:bg-zinc-800 text-white font-mono text-[11px] uppercase font-bold py-2 rounded-lg transition border border-black cursor-pointer"
                  >
                    WIPE ALL
                  </button>
                  <button
                    onClick={() => setShowWipeConfirm(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-mono text-[11px] uppercase font-bold py-2 rounded-lg transition cursor-pointer"
                  >
                    Keep
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowWipeConfirm(true)}
                className="w-full bg-zinc-800 text-white font-mono text-xs uppercase font-bold py-2.5 rounded-lg border-none hover:bg-black transition-all cursor-pointer shadow"
              >
                Wipe Database Cache
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Legal & Privacy Links */}
      <section className="pt-8 pb-4 text-center space-y-2 border-t border-slate-200 mt-8">
        <div className="flex items-center justify-center gap-4 text-xs font-mono uppercase tracking-wider font-bold">
          <a href="/privacy-policy.html" target="_blank" className="text-slate-500 hover:text-black transition-colors underline underline-offset-4">Privacy Policy</a>
          <span className="text-slate-300">|</span>
          <a href="/terms-of-service.html" target="_blank" className="text-slate-500 hover:text-black transition-colors underline underline-offset-4">Terms of Service</a>
        </div>
        <p className="text-[10px] font-mono text-slate-400 uppercase mt-2">© {new Date().getFullYear()} Nudge</p>
      </section>
    </div>
  );
}
