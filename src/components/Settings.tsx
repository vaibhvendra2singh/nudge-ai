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

  // Voice Sandbox Playground
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedResult, setExtractedResult] = useState<any | null>(null);
  const [recognitionObj, setRecognitionObj] = useState<any>(null);

  // Initialize SpeechRecognition for Playground
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onresult = (event: any) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setTranscript((prev) => {
            const separator = prev && !prev.endsWith(" ") ? " " : "";
            return prev + separator + finalTranscript;
          });
        }
      };

      rec.onerror = (event: any) => {
        console.error("Speech test error:", event.error);
        if (event.error === "not-allowed") {
          setSpeechError("Microphone access is not allowed in Settings. Please allow mic permissions.");
        } else {
          setSpeechError(`Speech error: ${event.error}`);
        }
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      setRecognitionObj(rec);
    }
  }, []);

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

  // Sound Sandbox test recording start
  const handlePlaygroundMicToggle = () => {
    if (!recognitionObj) {
      setSpeechError("Speech recognition is not supported in this browser. Use Chrome or Safari.");
      return;
    }
    setSpeechError(null);
    setTranscript("");
    setExtractedResult(null);

    if (isListening) {
      try {
        recognitionObj.stop();
      } catch (err) {
        console.error(err);
      }
      setIsListening(false);
    } else {
      try {
        recognitionObj.start();
        setIsListening(true);
      } catch (err) {
        console.error(err);
        setSpeechError("Microphone startup failed. Grant permissions next time.");
      }
    }
  };

  const handlePlaygroundExtract = async () => {
    if (!transcript.trim()) {
      setSpeechError("Speak or draft text first before dry-running intelligent extraction.");
      return;
    }

    if (isListening) {
      try {
        recognitionObj.stop();
      } catch (err) {}
      setIsListening(false);
    }

    setIsExtracting(true);
    setSpeechError(null);
    setExtractedResult(null);

    try {
      const response = await fetch("/api/gemini/extract-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speechText: transcript,
          currentDate: new Date().toISOString(),
        }),
      });

      if (!response.ok) throw new Error("Voice proxy service extraction failed.");
      const data = await response.json();
      setExtractedResult(data);
    } catch (e: any) {
      console.error(e);
      setSpeechError("Proxy parsing error. Check if server and keys are set up.");
    } finally {
      setIsExtracting(false);
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

      {/* Voice Sandbox Sandbox Playground Card */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 text-slate-800">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">settings_voice</span>
            <h3 className="font-headline text-sm font-bold uppercase tracking-wider">
              2. AI Voice Pipeline Playground
            </h3>
          </div>
          <span className="text-[10px] font-mono border px-1.5 py-0.5 rounded uppercase font-bold text-slate-400 bg-slate-50">
            Sandbox Sandbox
          </span>
        </div>

        <div className="space-y-3 pt-1">
          <div className="flex flex-wrap gap-2">
            {/* Record toggling button */}
            <button
              onClick={handlePlaygroundMicToggle}
              className={`flex items-center gap-1.5 px-3 py-2 font-mono text-xs uppercase font-bold border rounded-lg transition-all cursor-pointer ${
                isListening
                  ? "bg-red-500/10 border-red-500/30 text-red-500 animate-pulse"
                  : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
              }`}
            >
              <span className="material-symbols-outlined text-base">
                {isListening ? "stop_circle" : "mic"}
              </span>
              {isListening ? "Stop Test Capture" : "Test Mic Signal"}
            </button>

            {/* AI dryrun extraction */}
            <button
              onClick={handlePlaygroundExtract}
              disabled={isExtracting || !transcript.trim()}
              className="flex items-center gap-1.5 px-3 py-2 bg-black text-white font-mono text-xs uppercase font-bold border border-black rounded-lg hover:bg-zinc-800 transition-all cursor-pointer disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-base">auto_awesome</span>
              {isExtracting ? "Parsing..." : "Extract Dry-Run"}
            </button>
          </div>

          {/* Test Status transcript block */}
          <div className="bg-slate-50 border border-slate-150 rounded-lg p-3 space-y-2">
            <span className="block font-mono text-[9px] font-semibold text-slate-400 uppercase">
              Transcription Stream Output
            </span>
            {transcript ? (
              <p className="text-slate-800 text-xs font-mono break-words">
                "{transcript}"
              </p>
            ) : (
              <p className="text-slate-400 text-xs italic font-body">
                {isListening ? "Listening closely... speak a task (e.g. 'Gym workout tomorrow evening 6pm')" : "Mic signal inactive. Say details to test."}
              </p>
            )}
          </div>

          {speechError && (
            <p className="text-red-500 text-xs font-mono uppercase bg-red-50 border border-red-100 p-2.5 rounded-lg flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base">error</span>
              {speechError}
            </p>
          )}

          {/* Extracted JSON sandbox representation */}
          {extractedResult && (
            <div className="bg-zinc-950 text-emerald-430 rounded-xl p-3 border border-zinc-900 space-y-2 mt-2">
              <div className="flex justify-between items-center text-zinc-500 font-mono text-[9px] uppercase border-b border-zinc-800 pb-1.5">
                <span>Gemini API Structured Response Payload</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Resolved
                </span>
              </div>
              <pre className="text-[11px] font-mono leading-relaxed overflow-x-auto text-lime-400 bg-zinc-950 p-1">
                {JSON.stringify(extractedResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </section>

      {/* Cloud Storage & Cross-Device Sync */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-slate-800">
          <span className="material-symbols-outlined text-lg">cloud_sync</span>
          <h3 className="font-headline text-sm font-bold uppercase tracking-wider">
            3. Cross-Device Cloud Sync
          </h3>
        </div>

        <div className="pt-1">
          <div className="border border-slate-150 rounded-xl p-4 bg-slate-50 space-y-3">
            <div>
              <span className="font-mono text-[9px] text-slate-400 uppercase font-bold tracking-wider">Storage Mode</span>
              <h4 className="font-bold text-xs uppercase text-slate-800 mt-0.5">Supabase Direct Sync Enabled</h4>
              <p className="text-xs text-slate-500 mt-1 font-body">Your tasks are automatically saved directly to the cloud. Sign in with Google to sync them across all your devices seamlessly.</p>
            </div>
            
            <div className="pt-2">
              {isGoogleSignedIn ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100">
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    <span className="font-mono text-xs uppercase font-bold tracking-wider">Linked to Google Account</span>
                  </div>
                  <button
                    onClick={handleGoogleSignOut}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg font-mono text-[10px] uppercase font-bold transition shadow-sm cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">logout</span>
                    Sign Out & Use Local Identity
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {typeof window !== "undefined" && window.self !== window.top && (
                    <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs leading-relaxed font-body space-y-2">
                      <div className="flex items-center gap-1.5 font-mono font-bold uppercase tracking-wider text-[10px] text-amber-700">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        Iframe Sandbox Restrictions Active
                      </div>
                      <p>You are currently accessing the application inside the embedded AI Studio preview iframe. Google blocks OAuth sign-ins inside nested frames due to security policies.</p>
                      <p className="font-semibold text-amber-950">To connect your Google Account successfully:</p>
                      <ol className="list-decimal list-inside space-y-1 pl-1 text-amber-900">
                        <li>Click the <strong className="text-amber-950">Open in new tab</strong> button at the top-right of the AI Studio preview window.</li>
                        <li>Go to Settings &rarr; Cross-Device Cloud Sync and click <strong>Connect Google Account for Sync</strong>.</li>
                        <li>The authentication will complete seamlessly in your main tab and securely link your account!</li>
                      </ol>
                    </div>
                  )}
                  <button
                    onClick={handleGoogleSignIn}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-[#4285F4] text-white hover:bg-[#3367D6] rounded-lg font-mono text-[11px] uppercase font-bold transition shadow-sm cursor-pointer"
                  >
                    <svg className="w-4 h-4 bg-white p-[2px] rounded-sm" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Connect Google Account for Sync
                  </button>
                  {googleError && (
                    <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-lg text-xs font-mono space-y-1.5 leading-relaxed">
                      <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] text-red-700">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        OAuth Action Required
                      </div>
                      <p>{googleError}</p>
                    </div>
                  )}

                  {typeof window !== "undefined" && (
                    <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs leading-relaxed font-body space-y-3 mt-4">
                      <div className="flex items-center gap-1.5 font-mono font-bold uppercase tracking-wider text-[10px] text-amber-700">
                        <span className="material-symbols-outlined text-sm">error</span>
                        Why you see "404 Page not found" on your Phone/Browser
                      </div>
                      <p className="text-amber-950 font-medium">
                        Your Google account is actually signing in successfully (which is why you see your email in the Supabase Users list!), but the redirect is landing on a restricted URL. Here is why:
                      </p>
                      <ul className="list-disc list-inside space-y-1.5 text-amber-900 pl-1">
                        <li>
                          <strong>The Cause:</strong> The URL starting with <code className="bg-amber-100 px-1 py-0.5 rounded text-[10px]">ais-dev-...</code> is a private developer URL. It only works inside your Google AI Studio editor. Any other device (like your phone or another browser tab) is not authorized and will receive a Google Cloud Run <strong>"404 Page not found"</strong> page.
                        </li>
                        <li>
                          <strong>The Solution:</strong> You should use your public production URL <code className="bg-amber-100 px-1.5 py-0.5 rounded text-[10px] text-amber-950 font-semibold">{getSafeRedirectUrl()}</code> or the safe preview URL starting with <code className="bg-amber-100 px-1.5 py-0.5 rounded text-[10px] text-amber-950 font-semibold">ais-pre-...</code>!
                        </li>
                      </ul>

                      <div className="border-t border-amber-200 pt-2.5 space-y-2">
                        <p className="font-semibold text-amber-950 uppercase tracking-wider text-[10px] font-mono">
                          Follow these 3 simple steps in your Supabase Dashboard:
                        </p>
                        <ol className="list-decimal list-inside space-y-2.5 pl-1 text-amber-900">
                          <li>
                            Go to your <a href="https://supabase.com/dashboard/project/rpzzzbpaxdftxpldyzrb/auth/url-configuration" target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline font-bold inline-flex items-center gap-0.5">Supabase URL Configuration <span className="material-symbols-outlined text-[10px]">open_in_new</span></a> page for project <code className="bg-amber-100 px-1 py-0.5 rounded font-bold">rpzzzbpaxdftxpldyzrb</code>.
                          </li>
                          <li>
                            Change the <strong>Site URL</strong> field to exactly:
                            <div className="mt-1 p-2.5 bg-white border border-amber-200 rounded-lg font-mono text-[10px] select-all break-all text-slate-900 font-bold bg-amber-50/50 border-dashed">
                              {getSafeRedirectUrl()}
                            </div>
                          </li>
                          <li>
                            In the <strong>Redirect URLs</strong> section below it, click <strong>Add URL</strong> and add both of these exact URLs:
                            <div className="mt-1 p-2.5 bg-white border border-amber-200 rounded-lg font-mono text-[10px] select-all break-all text-slate-900 font-bold bg-amber-50/50 border-dashed space-y-1.5">
                              <div>{getSafeRedirectUrl()}</div>
                              <div>{window.location.origin.replace("ais-dev-", "ais-pre-")}</div>
                            </div>
                          </li>
                        </ol>
                      </div>
                      
                      <div className="bg-amber-100/50 p-2.5 rounded-lg border border-amber-200 text-[11px] text-amber-950 font-medium">
                        💡 <strong>After Saving:</strong> Access the app through <a href={getSafeRedirectUrl()} target="_blank" rel="noopener noreferrer" className="text-amber-950 underline font-bold">{getSafeRedirectUrl()}</a> on your phone, and sign in. It will redirect perfectly and connect your account without any 404 errors!
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Dangerous Wipe controls */}
      <section className="space-y-4">
        <h3 className="font-headline text-sm font-bold uppercase text-slate-500 tracking-wider">
          4. Dangerous Cache PURGE
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
