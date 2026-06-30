import React, { useState, useEffect } from "react";
import { Task } from "../types";
import { signInUserAnonymously, getTasks, saveTask, googleSignIn, logoutGoogle, auth, getSafeRedirectUrl } from "../supabase";

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
  const [googleError, setGoogleError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user: any) => {
      if (!user) {
        setIsGoogleSignedIn(false);
        return;
      }
      // Robust detection for Google / non-anonymous social logins
      const isAnon = user.is_anonymous === true;
      const isGoogleProvider = user.app_metadata?.provider === "google" || 
                               (user.identities && user.identities.some((id: any) => id.provider === "google"));
      const hasEmail = !!user.email && !user.email.endsWith("@anonymous.supabase.co");
      
      setIsGoogleSignedIn(!isAnon && (isGoogleProvider || hasEmail));
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
              placeholder="e.g. Alex"
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



      {/* Dangerous Wipe controls */}
      <section className="space-y-4">
        <h3 className="font-headline text-sm font-bold uppercase text-slate-500 tracking-wider">
          2. Dangerous Cache PURGE
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
