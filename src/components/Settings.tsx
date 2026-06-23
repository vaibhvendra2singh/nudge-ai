import React, { useState, useEffect } from "react";

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
  const [healthStatus, setHealthStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [healthMessage, setHealthMessage] = useState("");
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);

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
    setHealthMessage("Pinging server cluster health endpoint...");
    try {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error(`HTTP status error: ${res.status}`);
      const data = await res.json();
      if (data.status === "ok") {
        setHealthStatus("ok");
        setHealthMessage("Success! Server is online and receiving requests.");
      } else {
        throw new Error("Invalid status returned from host node.");
      }
    } catch (err: any) {
      console.error(err);
      setHealthStatus("error");
      setHealthMessage(err.message || "Endpoint host responded with severe fault. Check environment variables.");
    }
  };

  return (
    <div className="w-full space-y-6 animate-fade-in text-left pb-32 max-w-2xl mx-auto">
      {/* Header bar */}
      <section className="space-y-1 border-b border-slate-200 pb-4">
        <h2 className="font-headline text-xl sm:text-2xl font-black text-slate-800 uppercase tracking-tight">
          Settings & Diagnostics
        </h2>
        <p className="text-slate-400 text-xs font-mono uppercase">
          Configure the active workspace variables.
        </p>
      </section>

      {/* User Customization */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="font-headline text-sm font-bold uppercase text-slate-800 tracking-wider">
          1. Identity Configuration
        </h3>
        <form onSubmit={handleSaveName} className="space-y-3">
          <label className="block font-mono text-[10px] text-slate-400 font-bold uppercase tracking-wider" htmlFor="username-field">
            Display User Name
          </label>
          <div className="flex gap-2">
            <input
              id="username-field"
              type="text"
              required
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black w-full max-w-[280px]"
            />
            <button
              type="submit"
              className="bg-slate-900 text-white font-mono text-xs uppercase px-4 py-2 font-bold rounded-lg cursor-pointer hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
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

      {/* API Health & Integration Status */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-headline text-sm font-bold uppercase text-slate-800 tracking-wider">
            2. Gemini Agent Integration
          </h3>
          <span className="font-mono text-[9px] text-slate-400 border border-slate-200 rounded bg-slate-50 px-2 py-0.5">
            Alias: gemini-3.5-flash
          </span>
        </div>

        <p className="font-body text-xs text-slate-500 leading-relaxed">
          AI breakdown generation and smart urgent notifications are handled securely server-side. Your secrets and API credentials reside strictly in your private configuration.
        </p>

        <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${
                healthStatus === "ok" ? "bg-black animate-pulse" : (healthStatus === "error" ? "bg-zinc-400 animate-pulse border border-zinc-500" : "bg-neutral-300")
              }`} />
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-700 font-bold">
                Integration Health: {healthStatus.toUpperCase()}
              </span>
            </div>
            <button
              onClick={checkApiHealth}
              disabled={healthStatus === "testing"}
              className="px-3 py-1.5 font-mono text-[10px] uppercase font-bold border border-slate-200 rounded-lg bg-white text-slate-700 shadow-sm cursor-pointer hover:bg-slate-550 disabled:opacity-45"
            >
              Run Diagnostics
            </button>
          </div>
          {healthMessage && (
            <p className="font-mono text-xs text-slate-600 uppercase break-words bg-white border border-slate-200 rounded p-2.5 border-l-2 border-l-black">
              &gt; {healthMessage}
            </p>
          )}
        </div>

        <div className="text-[10px] text-slate-400 font-mono space-y-1 uppercase leading-snug">
          <p>No keys or passwords need to be entered directly in this form.</p>
          <p>If you encounters API key issues, confirm that the <strong className="text-slate-600 font-bold">GEMINI_API_KEY</strong> is loaded inside the <strong className="text-slate-600 font-bold">Settings &gt; Secrets</strong> panel inside your workspace.</p>
        </div>
      </section>

      {/* App Cache controls */}
      <section className="space-y-4">
        <h3 className="font-headline text-sm font-bold uppercase text-slate-500 tracking-wider">
          3. Workspace Cache Controls
        </h3>
        <p className="font-body text-xs text-slate-500">
          The application state resides locally inside current browser storage block (<strong className="text-slate-700">localStorage</strong>). There are currently <strong className="text-slate-700">{totalTasksCount} task item(s)</strong> parsed.
        </p>

        <div className="grid grid-cols-1 gap-4 pt-1">
          {/* Wipe Cache */}
          <div className="p-4 bg-zinc-100 border border-zinc-200 rounded-xl space-y-3 flex flex-col justify-between shadow-sm">
            <div>
              <p className="font-mono text-[10px] text-zinc-600 uppercase font-bold">Dangerous Actions</p>
              <p className="text-xs text-zinc-800 leading-relaxed font-body mt-1">
                Destructively purges the local browser cache and clears all task records. Cleans the slate entirely.
              </p>
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
                    className="flex-1 bg-black hover:bg-zinc-800 text-white font-mono text-[11px] uppercase font-bold py-2 rounded-lg transition border border-black"
                  >
                    WIPE ALL
                  </button>
                  <button
                    onClick={() => setShowWipeConfirm(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-mono text-[11px] uppercase font-bold py-2 rounded-lg transition"
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
    </div>
  );
}
