import React from "react";
import { Task } from "../types";
import { getTaskUrgencyDetails } from "../utils";

interface DashboardProps {
  tasks: Task[];
  onToggleComplete: (id: string, e: React.MouseEvent | React.ChangeEvent) => void;
  onSelectTask: (id: string) => void;
  onNavigateToTab: (tab: "dashboard" | "add_task" | "settings") => void;
  userName: string;
}

export default function Dashboard({
  tasks,
  onToggleComplete,
  onSelectTask,
  onNavigateToTab,
  userName = "Alex",
}: DashboardProps) {
  // Map titles to icons
  const getTaskIconName = (title: string, project: string): string => {
    const t = (title || "").toUpperCase();
    const p = (project || "").toUpperCase();
    if (t.includes("EMAIL") || t.includes("PROPOSAL") || t.includes("MAIL")) return "mail";
    if (t.includes("RUN") || t.includes("FITNESS") || t.includes("WORKOUT") || t.includes("KM")) return "fitness_center";
    if (t.includes("VACATION") || t.includes("FLIGHT") || t.includes("TRIP") || t.includes("JOURNEY")) return "flight";
    if (t.includes("DESIGN") || t.includes("STYLE") || t.includes("PALETTE") || t.includes("FIGMA")) return "palette";
    if (t.includes("DOCTOR") || t.includes("MED") || t.includes("APPOINTMENT") || t.includes("HEAL")) return "medical_services";
    if (t.includes("STRATEGY") || t.includes("Q3") || t.includes("ANALYZE") || t.includes("REVIEW")) return "monitoring";
    return p === "WORK" ? "assignment" : "person";
  };

  // Group tasks by urgency
  const categorizedTasks = tasks.map(task => {
    const details = getTaskUrgencyDetails(task);
    return {
      task,
      ...details,
    };
  });

  // Highlighted urgent tasks with NO completed subtasks
  const needsActionTasks = categorizedTasks.filter(item => {
    if (item.task.completed) return false;
    if (item.category !== "urgent") return false;
    const subtasksList = item.task.subtasks || [];
    const hasNoCompletedSubtasks = subtasksList.length === 0 || !subtasksList.some(s => s.completed);
    return hasNoCompletedSubtasks;
  });

  const [needsActionSummary, setNeedsActionSummary] = React.useState<string | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = React.useState(false);
  const [summaryError, setSummaryError] = React.useState(false);
  const [retryCount, setRetryCount] = React.useState(0);

  // Trigger Gemini summary fetch on mount or when the list of needs action tasks changes
  const needsActionKeysStr = needsActionTasks.map(item => `${item.task.id}-${item.task.completed}`).join(",");

  React.useEffect(() => {
    if (needsActionTasks.length === 0) {
      setNeedsActionSummary(null);
      return;
    }

    const cacheKey = `needs_action_summary_${needsActionKeysStr}`;
    // Skip cache reading if this is a manual user retry action
    if (retryCount === 0) {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setNeedsActionSummary(cached);
        setIsSummaryLoading(false);
        setSummaryError(false);
        return;
      }
    }

    let isMounted = true;
    const fetchSummary = async () => {
      setIsSummaryLoading(true);
      setSummaryError(false);
      try {
        const response = await fetch("/api/needs-action-summary", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tasks: needsActionTasks.map(item => ({
              title: item.task.title,
              details: item.task.details,
              project: item.task.project,
              priority: item.task.priority,
              deadline: item.task.deadline,
            })),
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch Needs Action summary");
        }

        const data = await response.json();
        if (isMounted) {
          setNeedsActionSummary(data.summary);
          try {
            sessionStorage.setItem(cacheKey, data.summary);
          } catch (e) {
            console.warn("sessionStorage setItem failed:", e);
          }
        }
      } catch (err) {
        console.error("Error loading Needs Action summary:", err);
        if (isMounted) {
          setSummaryError(true);
          // Fallback message locally
          const titles = needsActionTasks.map(item => `"${item.task.title}"`).join(" and ");
          const fb = `Focus on ${titles} right now to maintain your rhythm and meet your approaching deadlines.`;
          setNeedsActionSummary(fb);
        }
      } finally {
        if (isMounted) {
          setIsSummaryLoading(false);
        }
      }
    };

    fetchSummary();

    return () => {
      isMounted = false;
    };
  }, [needsActionKeysStr, retryCount]);

  const urgentTasks = categorizedTasks.filter(item => !item.task.completed && item.category === "urgent");
  const soonTasks = categorizedTasks.filter(item => !item.task.completed && item.category === "soon");
  const futureTasks = categorizedTasks.filter(item => !item.task.completed && item.category === "future");
  const completedTasks = categorizedTasks.filter(item => item.task.completed);

  return (
    <div className="w-full">
      {/* Greeting Section */}
      <section className="mb-8 text-left">
        <h1 className="font-headline font-extrabold text-slate-800 text-3xl sm:text-4xl uppercase tracking-tight mb-1">
          TAKE A BREATH, {userName || "ALEX"}.
        </h1>
        <p className="font-body text-slate-500 text-base sm:text-lg">
          Here's what's next on your path forward.
        </p>
      </section>

      {/* Stats Quick strip (High density card grid style) */}
      <div className="mb-8 grid grid-cols-3 bg-white border border-slate-200 divide-x divide-slate-200 rounded-xl text-center shadow-sm py-3">
        <div>
          <span className="block text-2xl font-black text-slate-800 leading-none">{urgentTasks.length}</span>
          <span className="text-slate-400 font-mono text-[9px] uppercase tracking-wider block mt-1">Urgent</span>
        </div>
        <div>
          <span className="block text-2xl font-black text-slate-800 leading-none">{soonTasks.length + futureTasks.length}</span>
          <span className="text-slate-400 font-mono text-[9px] uppercase tracking-wider block mt-1">Incoming</span>
        </div>
        <div>
          <span className="block text-2xl font-black text-slate-800 leading-none">{completedTasks.length}</span>
          <span className="text-slate-400 font-mono text-[9px] uppercase tracking-wider block mt-1">Resolved</span>
        </div>
      </div>

      {/* NEEDS ACTION NOW HIGHLIGHT SECTION */}
      {needsActionTasks.length > 0 && (
        <section className="mb-8 font-sans animate-fade-in" id="section-needs-action">
          <div className="bg-red-50/70 border border-red-200 rounded-xl p-5 shadow-sm text-left relative overflow-hidden">
            <div className="absolute right-0 top-0 w-32 h-32 bg-red-100/30 rounded-full blur-2xl pointer-events-none -mr-8 -mt-8" />
            
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="material-symbols-outlined text-red-600 animate-pulse font-bold text-lg">warning</span>
              <h2 className="font-headline text-xs font-black text-red-600 uppercase tracking-widest">
                Needs Action Now
              </h2>
              <span className="bg-red-100 text-red-800 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border border-red-200">
                IMMEDIATE CHECKS REQUIRED
              </span>
            </div>

            {isSummaryLoading ? (
              <div className="flex items-center gap-2.5 py-1">
                <div className="w-4 h-4 border-2 border-red-600 border-t-transparent animate-spin rounded-full"></div>
                <span className="font-mono text-xs uppercase font-bold tracking-wider text-red-700">
                  Compiling urgent actions with Gemini...
                </span>
              </div>
            ) : summaryError ? (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-red-100/40 p-3.5 rounded-xl border border-red-200">
                  <div className="space-y-0.5 text-left">
                    <p className="font-mono text-[9px] uppercase tracking-wider text-red-700 font-bold">API Offline or Multi-tenant Rate Limit</p>
                    <p className="text-xs text-red-650 leading-relaxed font-medium">
                      Gemini couldn't analyze the context right now. Standard offline guidelines were loaded dynamically.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRetryCount(prev => prev + 1)}
                    className="flex-shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-mono text-[10px] uppercase font-bold tracking-wider cursor-pointer shadow-xs whitespace-nowrap active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-[13px]">refresh</span>
                    <span>Retry Compilation</span>
                  </button>
                </div>
                {needsActionSummary && (
                  <p className="font-body text-slate-800 text-sm font-semibold leading-relaxed border-l-4 border-red-300 pl-3">
                    {needsActionSummary}
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  {needsActionTasks.map(({ task, timeLabel }) => (
                    <div
                      key={task.id}
                      onClick={() => onSelectTask(task.id)}
                      className="bg-white border border-red-100 hover:border-red-400 transition-all cursor-pointer flex justify-between items-center p-3 rounded-lg shadow-xs"
                    >
                      <div className="truncate pr-2">
                        <span className="font-mono text-[8px] text-red-600 font-bold uppercase tracking-wider block mb-0.5">
                          {task.project || "Task"}
                        </span>
                        <h4 className="font-headline font-bold text-xs uppercase text-slate-800 truncate">
                          {task.title}
                        </h4>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-1 font-mono text-[9px] text-red-700 font-bold bg-red-50/50 px-2 py-0.5 rounded border border-red-100">
                        <span className="material-symbols-outlined text-[13px] font-bold">schedule</span>
                        <span>{timeLabel}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {needsActionSummary && (
                  <p className="font-body text-slate-800 text-sm font-semibold leading-relaxed">
                    {needsActionSummary}
                  </p>
                )}
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  {needsActionTasks.map(({ task, timeLabel }) => (
                    <div
                      key={task.id}
                      onClick={() => onSelectTask(task.id)}
                      className="bg-white border border-red-100 hover:border-red-400 transition-all cursor-pointer flex justify-between items-center p-3 rounded-lg shadow-xs"
                    >
                      <div className="truncate pr-2">
                        <span className="font-mono text-[8px] text-red-600 font-bold uppercase tracking-wider block mb-0.5">
                          {task.project || "Task"}
                        </span>
                        <h4 className="font-headline font-bold text-xs uppercase text-slate-800 truncate">
                          {task.title}
                        </h4>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-1 font-mono text-[9px] text-red-700 font-bold bg-red-50/50 px-2 py-0.5 rounded border border-red-100">
                        <span className="material-symbols-outlined text-[13px] font-bold">schedule</span>
                        <span>{timeLabel}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* URGENT SECTION */}
      <section className="mb-8 font-sans" id="section-urgent">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-sm font-bold text-slate-500 uppercase tracking-widest">
            Urgent Tasks
          </h2>
          <span className="badge-urgent text-[10px] uppercase font-bold px-2 py-0.5 rounded-md">
            DUE TODAY
          </span>
        </div>

        {urgentTasks.length === 0 ? (
          <div className="bg-slate-50/50 border border-slate-200 border-dashed rounded-xl p-8 text-center space-y-2.5 shadow-sm animate-fade-in">
            <div className="mx-auto w-10 h-10 bg-slate-100/85 rounded-full flex items-center justify-center text-slate-400">
              <span className="material-symbols-outlined text-xl">spa</span>
            </div>
            <div className="space-y-1">
              <h3 className="font-headline text-xs font-bold text-slate-700 uppercase tracking-wider">No Urgent Demands</h3>
              <p className="font-body text-slate-500 text-xs max-w-md mx-auto leading-relaxed">
                Your immediate horizon is clear! There are no high-priority tasks due today. Use this space to plan ahead or take a well-deserved breathing rest.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {urgentTasks.map(({ task, timeLabel }) => {
              // Check if task has any uncompleted subtasks which would require an AI nudge decoration
              const subtasksList = task.subtasks || [];
              const hasNoCompletedSubtasks = subtasksList.length === 0 || !subtasksList.some(s => s.completed);
              
              return (
                <div
                  key={task.id}
                  onClick={() => onSelectTask(task.id)}
                  className="task-card bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between min-h-[150px] cursor-pointer hover:border-black hover:shadow-md transition-all relative group"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="bg-slate-100 text-slate-600 font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded border border-slate-200 font-bold">
                        {task.project || "Task"}
                      </span>
                      {hasNoCompletedSubtasks && (
                        <span 
                          title="Urgent alert trigger: Due in 24h with no completed subtasks"
                          className="w-2.5 h-2.5 bg-black rounded-full animate-ping"
                        />
                      )}
                    </div>
                    <h3 className="font-headline text-base font-bold text-slate-800 uppercase tracking-tight line-clamp-2 leading-snug">
                      {task.title}
                    </h3>
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center text-slate-800 font-mono text-xs uppercase tracking-wide gap-1">
                      <span className="material-symbols-outlined text-[16px] text-slate-700 font-bold">schedule</span>
                      <span className="font-bold">{timeLabel}</span>
                    </div>

                    <div 
                      onClick={(e) => onToggleComplete(task.id, e)}
                      className="cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={(e) => {}} // Proxy change handled on element click
                        className="cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SOON SECTION */}
      <section className="mb-8" id="section-soon">
        <h2 className="font-headline text-sm font-bold text-slate-500 mb-4 uppercase tracking-widest">
          Incoming Soon
        </h2>

        {soonTasks.length === 0 ? (
          <div className="bg-slate-50/50 border border-slate-200 border-dashed rounded-xl p-6 text-center space-y-2.5 shadow-xs animate-fade-in">
            <div className="mx-auto w-10 h-10 bg-slate-100/85 rounded-full flex items-center justify-center text-slate-400">
              <span className="material-symbols-outlined text-xl">calendar_today</span>
            </div>
            <div className="space-y-1">
              <h3 className="font-headline text-xs font-bold text-slate-700 uppercase tracking-wider">No Tasks Soon</h3>
              <p className="font-body text-slate-500 text-xs max-w-md mx-auto leading-relaxed">
                The next few days look beautifully spacious. No tasks have been scheduled for this timeframe.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {soonTasks.map(({ task, timeLabel }) => (
              <div
                key={task.id}
                onClick={() => onSelectTask(task.id)}
                className="task-card bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4 cursor-pointer hover:border-black hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-4 flex-1 overflow-hidden">
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0 text-slate-800">
                    <span className="material-symbols-outlined text-xl">
                      {getTaskIconName(task.title, task.project)}
                    </span>
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="font-headline text-sm sm:text-base font-bold text-slate-800 uppercase tracking-tight truncate">
                      {task.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-[9px] text-slate-400 uppercase font-bold">
                        {task.project || "Task"}
                      </span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full inline-block"></span>
                      <span className="badge-warning text-[9px] uppercase font-bold px-1.5 py-0.2 rounded-md">
                        {timeLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div 
                  onClick={(e) => onToggleComplete(task.id, e)}
                  className="cursor-pointer flex-shrink-0"
                >
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={(e) => {}}
                    className="cursor-pointer"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* FUTURE SECTION */}
      <section className="mb-12" id="section-future">
        <h2 className="font-headline text-sm font-bold text-slate-500 mb-4 uppercase tracking-widest">
          Schedules for Future
        </h2>

        {futureTasks.length === 0 ? (
          <div className="bg-slate-50/50 border border-slate-200 border-dashed rounded-xl p-6 text-center space-y-2.5 shadow-xs animate-fade-in">
            <div className="mx-auto w-10 h-10 bg-slate-100/85 rounded-full flex items-center justify-center text-slate-400">
              <span className="material-symbols-outlined text-xl">explore</span>
            </div>
            <div className="space-y-1">
              <h3 className="font-headline text-xs font-bold text-slate-700 uppercase tracking-wider">No Long-term Schedule</h3>
              <p className="font-body text-slate-500 text-xs max-w-md mx-auto leading-relaxed">
                No future dates are mapped out yet. Capture ideas early so you never feel hurried when they arrive.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {futureTasks.map(({ task, timeLabel }) => (
              <div
                key={task.id}
                onClick={() => onSelectTask(task.id)}
                className="task-card bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4 cursor-pointer hover:border-black hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-4 flex-1 overflow-hidden">
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0 text-slate-500">
                    <span className="material-symbols-outlined text-xl">
                      {getTaskIconName(task.title, task.project)}
                    </span>
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="font-headline text-sm sm:text-base font-medium text-slate-700 uppercase tracking-tight truncate">
                      {task.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-[9px] text-slate-400 uppercase">
                        {task.project || "Task"}
                      </span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full inline-block"></span>
                      <span className="badge-normal text-[9px] uppercase font-bold px-1.5 py-0.2 rounded-md">
                        {timeLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div 
                  onClick={(e) => onToggleComplete(task.id, e)}
                  className="cursor-pointer flex-shrink-0"
                >
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={(e) => {}}
                    className="cursor-pointer"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* RESOLVED / COMPLETED LIST */}
      <section className="mb-24 opacity-75" id="section-resolved">
        <h2 className="font-headline text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest">
          Resolved & Completed
        </h2>
        {completedTasks.length === 0 ? (
          <div className="bg-slate-50/30 border border-slate-200 border-dashed rounded-xl p-6 text-center space-y-2.5 animate-fade-in">
            <div className="mx-auto w-10 h-10 bg-slate-100/60 rounded-full flex items-center justify-center text-slate-400">
              <span className="material-symbols-outlined text-xl">verified</span>
            </div>
            <div className="space-y-1">
              <h3 className="font-headline text-[11px] font-bold text-slate-605 uppercase tracking-wider">No Resolved Items Yet</h3>
              <p className="font-body text-slate-400 text-xs max-w-md mx-auto leading-relaxed">
                Take things one deliberate step at a time. Once you check a task off as complete, it will be catalogued right here.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {completedTasks.map(({ task }) => (
              <div
                key={task.id}
                onClick={() => onSelectTask(task.id)}
                className="task-card bg-white/70 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-4 cursor-pointer hover:border-slate-300 transition-all"
              >
                <div className="flex items-center gap-3 flex-1 overflow-hidden">
                  <span className="material-symbols-outlined text-slate-400 text-lg">check_circle</span>
                  <div className="truncate">
                    <h3 className="font-headline text-sm font-semibold text-slate-500 line-through uppercase tracking-tight truncate">
                      {task.title}
                    </h3>
                    <div className="flex items-center gap-2 text-[9px] text-slate-400 uppercase font-mono">
                      <span>{task.project}</span>
                      <span>•</span>
                      <span>Completed</span>
                    </div>
                  </div>
                </div>

                <div 
                  onClick={(e) => onToggleComplete(task.id, e)}
                  className="cursor-pointer flex-shrink-0"
                >
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={(e) => {}}
                    className="cursor-pointer"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Floating Action Button (FAB) - High Density Styled */}
      <button
        onClick={() => onNavigateToTab("add_task")}
        aria-label="Add Task"
        className="fixed bottom-24 right-6 w-14 h-14 bg-black text-white rounded-full flex items-center justify-center shadow-lg shadow-zinc-500/20 hover:bg-zinc-900 transition-all duration-150 hover:scale-105 active:scale-95 z-40 cursor-pointer border border-zinc-950"
      >
        <span className="material-symbols-outlined text-[26px] font-bold">add</span>
      </button>
    </div>
  );
}
