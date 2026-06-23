import React from "react";
import { Task } from "../types";
import { getTaskUrgencyDetails } from "../utils";
import { CalendarEvent, checkDeadlineConflicts } from "../calendarService";

interface DashboardProps {
  tasks: Task[];
  onToggleComplete: (id: string, e: React.MouseEvent | React.ChangeEvent) => void;
  onSelectTask: (id: string) => void;
  onNavigateToTab: (tab: "dashboard" | "add_task" | "settings") => void;
  userName: string;
  gcalEvents?: CalendarEvent[];
  gcalConnected?: boolean;
  gcalUserEmail?: string | null;
  onConnectGcal?: () => void;
  onDisconnectGcal?: () => void;
  gcalLoadingEvents?: boolean;
  calendarError?: string | null;
}

export default function Dashboard({
  tasks,
  onToggleComplete,
  onSelectTask,
  onNavigateToTab,
  userName = "Alex",
  gcalEvents = [],
  gcalConnected = false,
  gcalUserEmail = null,
  onConnectGcal = () => {},
  onDisconnectGcal = () => {},
  gcalLoadingEvents = false,
  calendarError = null,
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

  // Run conflict checks across active (uncompleted) tasks
  const activeUncompletedTasks = tasks.filter(t => !t.completed);
  const detectedConflictsList: { task: Task; event: CalendarEvent; type: "direct" | "nearby" }[] = [];
  
  if (gcalConnected && gcalEvents.length > 0) {
    activeUncompletedTasks.forEach(task => {
      if (task.deadline) {
        const conflicts = checkDeadlineConflicts(task.deadline, task.timeSlot, gcalEvents);
        conflicts.forEach(c => {
          detectedConflictsList.push({
            task,
            event: c.event,
            type: c.type
          });
        });
      }
    });
  }

  // Calculate smart day suggestion
  const getSmartFreeDaySuggestion = (eventsList: CalendarEvent[]) => {
    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    
    // Let's count events per day for the next 7 days
    const dailyEventCounts: { [key: string]: { count: number; dateStr: string; name: string } } = {};
    
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i + 1); // starting tomorrow
      const dayStr = d.toISOString().split("T")[0];
      const dayName = daysOfWeek[d.getDay()];
      dailyEventCounts[dayStr] = { count: 0, dateStr: dayStr, name: dayName };
    }
    
    eventsList.forEach(ev => {
      const startStr = ev.start.dateTime || ev.start.date;
      if (!startStr) return;
      const evDayStr = startStr.split("T")[0];
      if (dailyEventCounts[evDayStr]) {
        dailyEventCounts[evDayStr].count++;
      }
    });
    
    // Find the day with the lowest event count
    const sortedDays = Object.values(dailyEventCounts).sort((a, b) => {
      const aIsWeekend = a.name === "Saturday" || a.name === "Sunday";
      const bIsWeekend = b.name === "Saturday" || b.name === "Sunday";
      if (a.count !== b.count) {
        return a.count - b.count;
      }
      if (aIsWeekend && !bIsWeekend) return 1;
      if (!aIsWeekend && bIsWeekend) return -1;
      return 0;
    });
    
    const suggestedDay = sortedDays[0];
    if (!suggestedDay) return "Friday afternoon";
    
    if (suggestedDay.count === 0) {
      return `${suggestedDay.name} is completely wide-open on your schedule. Optimal for new tasks!`;
    } else {
      return `${suggestedDay.name} is your lightest upcoming day with only ${suggestedDay.count} events.`;
    }
  };

  const smartDaySuggestion = gcalConnected && gcalEvents.length > 0
    ? getSmartFreeDaySuggestion(gcalEvents)
    : null;

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

      {/* GOOGLE CALENDAR ADVISOR (Active Bridge Sync) */}
      <section className="mb-8 text-left animate-fade-in" id="google-calendar-sync-widget">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-slate-700 bg-slate-100 p-1.5 rounded-lg text-lg">calendar_today</span>
              <div>
                <h3 className="font-headline text-xs font-black text-slate-800 uppercase tracking-widest leading-none">
                  Google Calendar Sync
                </h3>
                <p className="font-mono text-[9px] uppercase tracking-wider text-slate-400 mt-1">
                  {gcalConnected ? `Secure workspace link with ${gcalUserEmail || 'alex@gmail.com'}` : "Check active conflicts & find open focus blocks"}
                </p>
              </div>
            </div>

            {gcalConnected ? (
              <button
                onClick={onDisconnectGcal}
                className="font-mono text-[9px] uppercase font-bold tracking-wider text-red-500 hover:text-white px-2.5 py-1.5 border border-red-200 hover:bg-red-500 rounded-md transition-all cursor-pointer self-start sm:self-auto active:scale-95"
              >
                Disconnect Calendar
              </button>
            ) : (
              <button
                onClick={onConnectGcal}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg shadow-xs transition-all text-[10px] font-mono uppercase font-bold cursor-pointer active:scale-95"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                <span>Authorize Calendar</span>
              </button>
            )}
          </div>

          {calendarError && (
            <div className="bg-red-50 text-red-700 text-xs border border-red-100 p-3 rounded-lg mb-4 flex items-start gap-2 animate-shake">
              <span className="material-symbols-outlined text-sm font-bold mt-0.5">error_outline</span>
              <div>
                <p className="font-bold uppercase tracking-wider text-[9px] font-mono">Sync Blocked</p>
                <p className="mt-0.5 leading-relaxed font-semibold">{calendarError}</p>
                <button 
                  onClick={onConnectGcal}
                  className="font-mono text-[9px] uppercase underline mt-1.5 font-bold cursor-pointer block hover:text-red-900 animate-pulse"
                >
                  Click to re-authorize Google Calendar
                </button>
              </div>
            </div>
          )}

          {gcalLoadingEvents ? (
            <div className="flex items-center justify-center gap-2 py-6 text-slate-500 text-xs font-mono uppercase tracking-wider">
              <div className="w-4 h-4 border-2 border-slate-600 border-t-transparent animate-spin rounded-full"></div>
              <span>Securing timeline handshake...</span>
            </div>
          ) : gcalConnected ? (
            <div className="space-y-4 font-sans text-slate-800">
              {/* Conflicts Alerts Banner */}
              {detectedConflictsList.length > 0 ? (
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 text-left">
                  <div className="flex items-center gap-1.5 text-amber-800 mb-2 font-bold font-headline text-xs uppercase tracking-wider">
                    <span className="material-symbols-outlined text-base animate-bounce">warning</span>
                    <span>{detectedConflictsList.length} Scheduling Flag Conflicts</span>
                  </div>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto">
                    {detectedConflictsList.map(({ task, event }) => {
                      const startStr = event.start.dateTime || event.start.date || "";
                      const displayTime = event.start.dateTime 
                        ? new Date(startStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
                        : "All-Day";
                      return (
                        <div key={`${task.id}-${event.id}`} className="bg-white border border-amber-200/60 p-2.5 rounded-lg flex items-center justify-between text-xs gap-3">
                          <div className="truncate text-left">
                            <span className="font-bold text-slate-800 uppercase block sm:inline mr-1">{task.title}</span>
                            <span className="text-amber-700 italic">overlaps with '{event.summary || "Busy Slot"}'</span>
                          </div>
                          <div className="font-mono text-[10px] font-bold text-amber-850 whitespace-nowrap">
                            {task.deadline} • {task.timeSlot || displayTime}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50/20 border border-emerald-100 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-800">
                  <span className="material-symbols-outlined text-emerald-600 font-bold">verified</span>
                  <p className="font-semibold text-left">
                    No active scheduling collisions. All task deadlines align with your Google Calendar events.
                  </p>
                </div>
              )}

              {/* Suggestions / Smarter Deadline Adviser */}
              {smartDaySuggestion && (
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5 text-left">
                    <span className="font-mono text-[9px] font-bold text-slate-500 uppercase tracking-widest block font-sans">Smarter Deadlines Advisor</span>
                    <p className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                      {smartDaySuggestion}
                    </p>
                  </div>
                  <button
                    onClick={() => onNavigateToTab("add_task")}
                    className="flex-shrink-0 font-mono text-[9px] uppercase font-bold tracking-wider px-3 py-1.5 bg-black hover:bg-slate-800 text-white rounded-lg cursor-pointer self-start sm:self-auto active:scale-95 transition-all shadow-sm"
                  >
                    Schedule Focus
                  </button>
                </div>
              )}

              {/* Interactive Calendar Feed Strip */}
              <div className="pt-2">
                <span className="font-mono text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2 text-left">Upcoming Commitments (7 days)</span>
                {gcalEvents.length === 0 ? (
                  <p className="font-mono text-center text-xs py-4 text-slate-400 uppercase">Your Calendar is completely empty for the next 7 days.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {gcalEvents.slice(0, 4).map(event => {
                      const startStr = event.start.dateTime || event.start.date || "";
                      const start = new Date(startStr);
                      const dateDisplay = start.toLocaleDateString([], { month: "short", day: "numeric" });
                      const timeDisplay = event.start.dateTime
                        ? start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
                        : "All-Day";
                        
                      return (
                        <div key={event.id} className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200/50 rounded-lg flex items-center justify-between gap-3 text-left transition-all">
                          <div className="truncate">
                            <p className="font-headline text-xs font-bold text-slate-800 truncate uppercase mt-0.5">{event.summary || "Busy Block"}</p>
                            <p className="font-mono text-[9px] text-slate-400 uppercase mt-0.5">{dateDisplay} • {timeDisplay}</p>
                          </div>
                          <span className="text-slate-350 select-none material-symbols-outlined text-sm">schedule</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 px-4 space-y-3.5">
              <div className="mx-auto w-12 h-12 bg-slate-50 border border-slate-200 rounded-full flex items-center justify-center text-slate-400">
                <span className="material-symbols-outlined text-2xl">sync_lock</span>
              </div>
              <div className="space-y-1">
                <h4 className="font-headline text-xs font-bold text-slate-700 uppercase tracking-wider">Sync Google Calendar commitments</h4>
                <p className="font-body text-slate-500 text-xs max-w-sm mx-auto leading-relaxed">
                  Avoid planning overlapping task deadlines. Direct Google Calendar sync checks your availability dynamically, indicates collisions, and computes optimal times.
                </p>
              </div>
              <div className="flex justify-center pt-1">
                <button
                  onClick={onConnectGcal}
                  className="flex items-center gap-2 px-4 py-2.5 bg-black hover:bg-zinc-900 border border-zinc-800 text-white rounded-lg shadow-sm transition-all text-xs font-mono uppercase font-bold cursor-pointer active:scale-95"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>Connect Google Calendar</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

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
                      <div className="flex-shrink-0 flex items-center gap-1 font-mono text-[10px] text-red-700 font-bold">
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
                      <div className="flex-shrink-0 flex items-center gap-1 font-mono text-[10px] text-red-700 font-bold">
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
        <div className="mb-4">
          <h2 className="font-headline text-sm font-bold text-slate-500 uppercase tracking-widest">
            Urgent Tasks
          </h2>
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
                    <div className="mb-2">
                      <span className="text-slate-500 font-mono text-[10px] uppercase tracking-wider font-bold">
                        {task.project || "Task"}
                      </span>
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
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-[10px] text-slate-400 uppercase font-bold">
                        {task.project || "Task"}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 font-bold uppercase">
                        • {timeLabel}
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
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-[10px] text-slate-400 uppercase">
                        {task.project || "Task"}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 font-bold uppercase">
                        • {timeLabel}
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
