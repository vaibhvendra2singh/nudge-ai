import React, { useState, useEffect } from "react";
import { Task } from "../types";

interface RiskWarning {
  type: string;
  message: string;
  recommendation: string;
}

interface AnalysisResult {
  riskWarnings: RiskWarning[];
  generalInsights: string[];
  completionForecast: string;
}

interface AnalyticsProps {
  tasks: Task[];
  userName: string;
}

export default function Analytics({ tasks, userName }: AnalyticsProps) {
  const [loading, setLoading] = useState(false);
  const [aiData, setAiData] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Synchronise / Call backend API to analyze patterns
  const runPatternAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/gemini/analyze-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks,
          currentDate: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to process pattern analysis.");
      }

      const data = await response.json();
      setAiData(data);
    } catch (err: any) {
      console.error("Pattern analysis error:", err);
      setError("Unable to compute live predictive models. System has activated the local analytics generator.");
    } finally {
      setLoading(false);
    }
  };

  // Run automatically on mount or when tasks list size changes
  useEffect(() => {
    runPatternAnalysis();
  }, [tasks.length]);

  // Compute stats locally to guarantee instant, secure offline KPI metrics
  const totalCount = tasks.length;
  const completedTasks = tasks.filter((t) => t.completed);
  const completedCount = completedTasks.length;
  const activeCount = totalCount - completedCount;
  
  const completionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Calculat On-Time completion rate (where completedAt <= deadline)
  const onTimeCount = completedTasks.filter((t) => {
    if (!t.deadline || !t.completedAt) return true; // default on time if timestamps missing
    const dDate = new Date(t.deadline);
    const cDate = new Date(t.completedAt);
    return cDate <= dDate;
  }).length;
  
  const onTimePercent = completedCount > 0 ? Math.round((onTimeCount / completedCount) * 100) : 0;

  // Compute most active category & most completed category
  const projStats: Record<string, { total: number; completed: number }> = {};
  tasks.forEach((t) => {
    const proj = t.project || "General";
    if (!projStats[proj]) {
      projStats[proj] = { total: 0, completed: 0 };
    }
    projStats[proj].total++;
    if (t.completed) {
      projStats[proj].completed++;
    }
  });

  // Identify lowest completion category with at least one task (for procrastinated)
  let worstProj = "None";
  let minRate = 1.1;
  let worstCount = 0;

  Object.keys(projStats).forEach((proj) => {
    const stats = projStats[proj];
    const rate = stats.completed / stats.total;
    if (rate < minRate && stats.total > 0) {
      minRate = rate;
      worstProj = proj;
      worstCount = stats.total - stats.completed;
    }
  });

  // Calculate best time slot based on completed tasks
  const timeSlotCounts: Record<string, number> = {
    Morning: 0,   // Slots before 12:00
    Afternoon: 0, // Slots between 12:00 and 17:00
    Evening: 0,   // Slots after 17:00
  };

  completedTasks.forEach((t) => {
    if (t.timeSlot) {
      try {
        const hour = parseInt(t.timeSlot.split(":")[0]);
        if (hour < 12) {
          timeSlotCounts.Morning++;
        } else if (hour < 17) {
          timeSlotCounts.Afternoon++;
        } else {
          timeSlotCounts.Evening++;
        }
      } catch (err) {
        // use afternoon as default backup
        timeSlotCounts.Afternoon++;
      }
    } else {
      // default focus blocks fall into midday/afternoon hours
      timeSlotCounts.Afternoon++;
    }
  });

  let bestTime = "No Active Data";
  let maxCompleted = 0;
  Object.keys(timeSlotCounts).forEach((slot) => {
    if (timeSlotCounts[slot] > maxCompleted) {
      maxCompleted = timeSlotCounts[slot];
      bestTime = slot;
    }
  });

  // Standard Week Days analysis for beautiful SVG visualizer
  const weekdaysLabel = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const daysTotal = [0, 0, 0, 0, 0, 0, 0];
  const daysCompleted = [0, 0, 0, 0, 0, 0, 0];

  tasks.forEach((t) => {
    if (t.deadline) {
      const d = new Date(t.deadline);
      const dayIndex = d.getDay();
      if (!isNaN(dayIndex)) {
        daysTotal[dayIndex]++;
        if (t.completed) {
          daysCompleted[dayIndex]++;
        }
      }
    }
  });

  const maxTotalForChart = Math.max(...daysTotal, 1);

  return (
    <div className="space-y-6 font-sans text-slate-800 pb-16" id="panel-analytics">
      {/* HEADER HERO AREA */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-headline text-lg sm:text-xl font-black text-slate-900 uppercase tracking-tight leading-tight">
            Behavioral Analytics & Risks
          </h2>
        </div>
        <button
          onClick={runPatternAnalysis}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 bg-white hover:border-black active:bg-slate-50 transition-all font-mono text-[10px] font-bold uppercase tracking-wider rounded-lg shadow-sm cursor-pointer disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-[14px] ${loading ? "animate-spin" : ""}`}>
            sync
          </span>
          <span>{loading ? "Analyzing..." : "Refresh Insights"}</span>
        </button>
      </div>

      {/* CORE STATS OVERVIEW DECK */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Metric 1 - Completion Rate */}
        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="block font-mono text-[9px] uppercase tracking-wider text-slate-400 font-black">
              Completion Rate
            </span>
            <span className="block text-3xl font-extrabold text-black font-headline">
              {completionPercent}%
            </span>
            <span className="block text-[10px] text-slate-500 font-mono font-medium">
              {completedCount} of {totalCount} tasks resolved
            </span>
          </div>
          <div className="relative w-14 h-14 flex items-center justify-center">
            {/* Visual SVG Ring */}
            <svg className="absolute w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-100"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-black transition-all duration-500"
                strokeDasharray={`${completionPercent}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="font-mono text-[10px] font-bold text-black">{completionPercent}%</span>
          </div>
        </div>

        {/* Metric 2 - On Time Rate */}
        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="block font-mono text-[9px] uppercase tracking-wider text-slate-400 font-black">
              On-Time Delivery
            </span>
            <span className="block text-3xl font-extrabold text-black font-headline">
              {completedCount > 0 ? `${onTimePercent}%` : "100%"}
            </span>
          </div>
          <div className="p-3 bg-zinc-50 border border-slate-100 rounded-lg">
            <span className="material-symbols-outlined text-black font-bold text-2xl">
              verified
            </span>
          </div>
        </div>

        {/* Metric 3 - Productivity Insights */}
        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm flex items-center justify-between">
          <div className="space-y-1 w-full">
            <span className="block font-mono text-[9px] uppercase tracking-wider text-slate-400 font-black">
              Cognitive Peak Hour
            </span>
            <span className="block text-2xl font-black text-black font-headline uppercase tracking-tight truncate">
              {bestTime}
            </span>
          </div>
        </div>
      </div>

      {/* DUAL COGNITIVE CORE: RISK ANALYSIS (LEFT) vs SCHEDULATION FORECAST (RIGHT) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* PREDICTIVE RISK FLAGS SECTION - 7 columns */}
        <div className="md:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-headline text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base text-black font-bold">
                gavel
              </span>
              <span>Proactive Risk Audit</span>
            </h3>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 rounded-full border-4 border-slate-100 border-t-black animate-spin"></div>
              <p className="font-mono text-[9px] uppercase text-slate-400 font-bold animate-pulse tracking-wider">
                Rebuilding predictive brain models...
              </p>
            </div>
          ) : error && !aiData ? (
            <div className="bg-amber-50 border border-amber-200/65 rounded-xl p-4 text-amber-800 space-y-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-700 font-bold text-lg">warning</span>
                <h4 className="font-headline font-bold text-xs uppercase tracking-wider">Warning model error</h4>
              </div>
              <p className="font-mono text-[10px] uppercase leading-relaxed text-amber-900">{error}</p>
            </div>
          ) : (!aiData || aiData.riskWarnings.length === 0) ? (
            <div className="py-8 text-center bg-slate-25/50 border border-dashed border-slate-200 rounded-xl">
              <span className="material-symbols-outlined text-slate-300 text-3xl">sentiment_satisfied</span>
              <p className="font-mono text-xs text-slate-400 uppercase tracking-wider mt-2 px-4">
                0 behavior anomalies detected. Keep doing what you're doing.
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1">
              {aiData.riskWarnings.map((warn, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl border border-rose-100 bg-rose-25/25 hover:bg-rose-50/10 transition-all flex items-start gap-3"
                >
                  <span className="material-symbols-outlined text-rose-500 font-bold shrink-0 mt-0.5 text-xl">
                    error_outline
                  </span>
                  <div className="space-y-1.5">
                    <span className="inline-block bg-rose-50 text-rose-700 border border-rose-100 font-mono text-[8px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wide">
                      {warn.type ? warn.type.replace("-", " ") : "Pattern Alert"}
                    </span>
                    <p className="text-slate-800 font-semibold text-xs leading-normal">
                      {warn.message}
                    </p>
                    <div className="bg-white border border-rose-50 rounded-lg p-2.5 mt-1.5 flex items-start gap-1.5">
                      <span className="font-mono text-[9px] font-black text-rose-600 uppercase shrink-0">
                        REC:
                      </span>
                      <p className="font-mono text-[9px] text-slate-505 leading-relaxed uppercase tracking-wider">
                        {warn.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* COMPLETION FORECAST & GENERAL INSIGHTS - 5 columns */}
        <div className="md:col-span-5 flex flex-col justify-between gap-5">
          {/* Top: Quantitative Forecast */}
          <div className="bg-black text-white p-5 rounded-xl shadow-lg space-y-3 shrink-0">
            <h4 className="font-headline font-bold text-[10px] uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-amber-400">online_prediction</span>
              <span>Predicted Forecast (Next 7 Days)</span>
            </h4>
            {loading ? (
              <div className="py-4 space-y-2">
                <div className="h-6 bg-zinc-800 rounded animate-pulse w-3/4"></div>
                <div className="h-4 bg-zinc-800 rounded animate-pulse w-1/2"></div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="font-headline font-bold text-sm sm:text-base leading-snug text-white">
                  {aiData?.completionForecast || "Analyzing task velocity..."}
                </p>
              </div>
            )}
          </div>

          {/* Bottom: General Insights List */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 flex-1">
            <h4 className="font-headline text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5 border-b border-slate-100 pb-3">
              <span className="material-symbols-outlined text-base text-black">psychology</span>
              <span>Habit Discoveries</span>
            </h4>

            {loading ? (
              <div className="space-y-3 py-6">
                <div className="h-4 bg-slate-100 rounded animate-pulse"></div>
                <div className="h-4 bg-slate-100 rounded animate-pulse w-5/6"></div>
                <div className="h-4 bg-slate-100 rounded animate-pulse w-2/3"></div>
              </div>
            ) : (!aiData || aiData.generalInsights.length === 0) ? (
              <p className="font-mono text-[10px] text-slate-400 uppercase tracking-widest text-center py-8">
                Insufficient records to classify habits.
              </p>
            ) : (
              <ul className="space-y-3 font-mono text-[10px] uppercase tracking-wider text-slate-505 font-medium">
                {aiData.generalInsights.map((ins, idx) => (
                  <li key={idx} className="flex items-start gap-2 border-b border-dashed border-slate-100 pb-2.5 last:border-0 last:pb-0">
                    <span className="text-black font-black mt-0.5">•</span>
                    <span className="leading-relaxed">{ins}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* BENTO GRID GRAPHICAL INTERFACE CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-5">
        {/* Day distribution bar chart (7 cols) */}
        <div className="sm:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <h4 className="font-headline text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base text-black">calendar_view_week</span>
            <span>Task Distribution & Resolution by Weekday</span>
          </h4>

          {totalCount === 0 ? (
            <div className="py-12 text-center">
              <p className="font-mono text-xs text-slate-400 uppercase tracking-widest">
                0 Active benchmarks found.
              </p>
            </div>
          ) : (
            <div className="space-y-6 pt-2">
              {/* Graphical Week bars */}
              <div className="flex justify-between items-end h-[160px] pt-4 px-2 select-none">
                {weekdaysLabel.map((day, idx) => {
                  const total = daysTotal[idx];
                  const completed = daysCompleted[idx];
                  const totalHeightPct = (total / maxTotalForChart) * 100;
                  const compHeightPct = total > 0 ? (completed / total) * 100 : 0;

                  return (
                    <div key={day} className="flex flex-col items-center flex-1 space-y-2 group">
                      {/* Bar columns */}
                      <div className="w-6 bg-slate-100 border border-slate-200/50 rounded-md relative flex items-end overflow-hidden" style={{ height: "110px" }}>
                        {/* Completed task bar overlay */}
                        {total > 0 && (
                          <div 
                            title={`${completed} resolved out of ${total} deliverables`}
                            className="w-full bg-black border-t border-black transition-all duration-500 absolute bottom-0"
                            style={{ height: `${totalHeightPct}%` }}
                          >
                            <div 
                              className="w-full bg-zinc-300 absolute top-0" 
                              style={{ height: `${100 - compHeightPct}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Monospace Day label */}
                      <div className="text-center">
                        <span className="block font-mono text-[9px] uppercase font-bold text-slate-805">
                          {day}
                        </span>
                        <span className="block font-mono text-[8px] text-slate-400 font-semibold leading-none mt-0.5">
                          {completed}/{total}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="flex gap-4 font-mono text-[8px] font-bold uppercase justify-center text-slate-400 bg-slate-50 p-2.5 rounded-lg border border-slate-200/50">
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-black rounded"></span>
                  <span>Completed Tasks</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-zinc-300 rounded"></span>
                  <span>Incomplete Tasks</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Most Procrastinated project category tracker & balance bars (5 cols) */}
        <div className="sm:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <h4 className="font-headline text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base text-black">analytics</span>
            <span>Category Resolution</span>
          </h4>

          {Object.keys(projStats).length === 0 ? (
            <div className="py-12 text-center font-mono text-xs text-slate-400 uppercase tracking-widest">
              No categories built yet.
            </div>
          ) : (
            <div className="space-y-4 pt-1 max-h-[220px] overflow-y-auto">
              {Object.keys(projStats).map((proj) => {
                const stats = projStats[proj];
                const pct = Math.round((stats.completed / stats.total) * 100);

                return (
                  <div key={proj} className="space-y-1">
                    <div className="flex justify-between items-center font-mono text-[9px] font-bold uppercase text-slate-600">
                      <span className="truncate max-w-[150px]">{proj}</span>
                      <span>({stats.completed}/{stats.total}) &bull; {pct}%</span>
                    </div>
                    {/* Visual Bar gauge */}
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-150 relative">
                      <div 
                        className="bg-black h-full rounded-full transition-all duration-500" 
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Procrastiator Warning Callout */}
              {worstProj !== "None" && minRate < 0.8 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mt-4 flex gap-2">
                  <span className="material-symbols-outlined text-amber-700 font-bold text-lg select-none shrink-0">
                    pending_actions
                  </span>
                  <div>
                    <span className="block font-mono text-[9px] uppercase tracking-wider text-amber-400 font-black">
                      Attention Requirement
                    </span>
                    <p className="font-mono text-[9px] uppercase tracking-wide leading-normal text-amber-900 mt-1">
                      Low-velocity area item: <strong>{worstProj}</strong> has {worstCount} unscheduled backlog. Break these down next!
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
