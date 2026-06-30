import React from "react";
import { Task } from "../types";
import { getTaskUrgencyDetails, playNudgeChime } from "../utils";
import Chatbot from "./Chatbot";

const TaskProgressRing = ({ subtasks }: { subtasks: Task["subtasks"] }) => {
  if (!subtasks || subtasks.length === 0) return null;
  const total = subtasks.length;
  const completed = subtasks.filter(s => s.completed).length;
  const percentage = (completed / total) * 100;
  
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex items-center gap-1" title={`${completed}/${total} subtasks completed`}>
      <div className="relative w-4 h-4 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 24 24">
          <circle
            cx="12" cy="12" r={radius}
            stroke="currentColor"
            strokeWidth="3.5"
            fill="none"
            className="text-slate-200"
          />
          <circle
            cx="12" cy="12" r={radius}
            stroke="currentColor"
            strokeWidth="3.5"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={`${percentage === 100 ? 'text-emerald-500' : 'text-slate-800'} transition-all duration-300`}
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
};

interface DashboardProps {
  tasks: Task[];
  onToggleComplete: (id: string, e: React.MouseEvent | React.ChangeEvent) => void;
  onSelectTask: (id: string) => void;
  onNavigateToTab: (tab: "dashboard" | "add_task" | "settings") => void;
  userName: string;
  onUpdateTask?: (task: Task) => void;
  onDeleteTask?: (id: string) => void;
}

export default function Dashboard({
  tasks,
  onToggleComplete,
  onSelectTask,
  onNavigateToTab,
  userName = "User",
  onUpdateTask,
  onDeleteTask,
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

  const [searchQuery, setSearchQuery] = React.useState("");

  const [notificationPermission, setNotificationPermission] = React.useState(
    typeof window !== "undefined" ? (Notification as any).permission : "default"
  );

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        playNudgeChime();
      }
    }
  };

  // Gamification & Streak calculations
  const completed = React.useMemo(() => tasks.filter(t => t.completed), [tasks]);
  
  // Extract unique completion dates
  const completedDates = React.useMemo(() => {
    return Array.from(new Set(
      completed.map(t => {
        const dateStr = t.completedAt || t.deadline || new Date().toISOString();
        return dateStr.split("T")[0];
      })
    )).sort();
  }, [completed]);

  const streakStats = React.useMemo(() => {
    if (completedDates.length === 0) {
      return { currentStreak: 0, bestStreak: 0, totalCompleted: completed.length };
    }

    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;

    const todayStr = new Date().toISOString().split("T")[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const parseDateStr = (str: string) => {
      const [y, m, d] = str.split("-").map(Number);
      return new Date(y, m - 1, d);
    };

    let lastDate: Date | null = null;

    for (let i = 0; i < completedDates.length; i++) {
      const currentDate = parseDateStr(completedDates[i]);
      if (lastDate === null) {
        tempStreak = 1;
      } else {
        const diffTime = Math.abs(currentDate.getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
          tempStreak++;
        } else if (diffDays > 1) {
          if (tempStreak > bestStreak) {
            bestStreak = tempStreak;
          }
          tempStreak = 1;
        }
      }
      lastDate = currentDate;
    }

    if (tempStreak > bestStreak) {
      bestStreak = tempStreak;
    }

    const lastCompletedDateStr = completedDates[completedDates.length - 1];
    const isActive = lastCompletedDateStr === todayStr || lastCompletedDateStr === yesterdayStr;
    currentStreak = isActive ? tempStreak : 0;

    return {
      currentStreak,
      bestStreak: Math.max(bestStreak, currentStreak),
      totalCompleted: completed.length,
    };
  }, [completedDates, completed.length]);

  // Badges structure
  const badges = React.useMemo(() => {
    const highPriorityCount = completed.filter(t => t.priority === "high").length;
    const completedSubtasksCount = completed.reduce((sum, t) => sum + (t.subtasks?.filter(s => s.completed).length || 0), 0);

    return [
      {
        id: "rookie",
        name: "Productivity Rookie",
        description: "Resolved your first task and initiated your journey",
        icon: "spa",
        active: streakStats.totalCompleted >= 1
      },
      {
        id: "consistency",
        name: "Consistency Master",
        description: "Achieved a consecutive task completion streak of 3+ days",
        icon: "local_fire_department",
        active: streakStats.bestStreak >= 3
      },
      {
        id: "deadline",
        name: "Deadline Slayer",
        description: "Completed 3 or more active tasks to clear your backlog",
        icon: "gps_fixed",
        active: streakStats.totalCompleted >= 3
      },
      {
        id: "deep_worker",
        name: "Deep Worker",
        description: "Successfully resolved 2 or more High-Priority items",
        icon: "offline_bolt",
        active: highPriorityCount >= 2
      },
      {
        id: "focus",
        name: "Focus Champion",
        description: "Cleared 5 or more subtasks under structured focus",
        icon: "military_tech",
        active: completedSubtasksCount >= 5
      }
    ];
  }, [completed, streakStats]);

  const [timeline, setTimeline] = React.useState<any[]>(() => {
    const saved = localStorage.getItem("nudge_ai_timeline");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });
  const [isTimelineLoading, setIsTimelineLoading] = React.useState(false);
  const [timelineError, setTimelineError] = React.useState<string | null>(null);

  const handlePlanMyDay = async () => {
    setIsTimelineLoading(true);
    setTimelineError(null);
    try {
      const response = await fetch("/api/gemini/plan-day", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tasks: tasks.map(t => ({
            title: t.title,
            details: t.details,
            priority: t.priority,
            project: t.project,
            deadline: t.deadline,
            timeSlot: t.timeSlot
          }))
        })
      });

      if (!response.ok) {
        throw new Error("Failed to compile timeline routine");
      }

      const data = await response.json();
      if (data && Array.isArray(data.timeline)) {
        setTimeline(data.timeline);
        localStorage.setItem("nudge_ai_timeline", JSON.stringify(data.timeline));
      } else {
        throw new Error("Invalid response format received");
      }
    } catch (err: any) {
      console.error("Timeline Generation Error:", err);
      setTimelineError("Failed to synchronize with Gemini. Standard local timeline has been compiled instead.");
      const fallback = getLocalFallbackPlanDay(tasks);
      setTimeline(fallback.timeline);
      localStorage.setItem("nudge_ai_timeline", JSON.stringify(fallback.timeline));
    } finally {
      setIsTimelineLoading(false);
    }
  };

  const getLocalFallbackPlanDay = (tasksList: Task[]) => {
    const active = tasksList.filter(t => !t.completed && !t.archived);
    const urgent = active.filter(t => t.priority === "high");
    const other = active.filter(t => t.priority !== "high");

    const urgentTitles = urgent.map(t => t.title);
    const otherTitles = other.map(t => t.title);

    return {
      timeline: [
        {
          time: "09:00 AM",
          activity: "High-Priority Deep Focus block. Attack core tasks requiring maximum cognitive power.",
          tasks: urgentTitles.slice(0, 2),
          duration: "90 mins",
          type: "focus"
        },
        {
          time: "11:00 AM",
          activity: "Administrative Sync & Communications checklist.",
          tasks: otherTitles.slice(0, 1),
          duration: "45 mins",
          type: "admin"
        },
        {
          time: "12:00 PM",
          activity: "Mindful Lunch Break & Respite.",
          tasks: [],
          duration: "60 mins",
          type: "break"
        },
        {
          time: "01:30 PM",
          activity: "Routine task execution block for supplementary project milestones.",
          tasks: otherTitles.slice(1, 3),
          duration: "90 mins",
          type: "routine"
        },
        {
          time: "03:30 PM",
          activity: "Brief decompression block to stretch, rehydrate, and reset focus.",
          tasks: [],
          duration: "15 mins",
          type: "break"
        },
        {
          time: "04:00 PM",
          activity: "Daily progression wrap-up and planning alignment for tomorrow.",
          tasks: urgentTitles.slice(2, 4).concat(otherTitles.slice(3, 5)),
          duration: "45 mins",
          type: "review"
        }
      ]
    };
  };

  // Highlighted urgent tasks with NO completed subtasks
  const needsActionTasks = categorizedTasks.filter(item => {
    if (item.task.completed) return false;
    if (item.task.archived) return false;
    if (item.category !== "urgent") return false;
    if (!item.task.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
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

  const urgentTasks = categorizedTasks.filter(item => !item.task.completed && !item.task.archived && item.category === "urgent" && item.task.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const soonTasks = categorizedTasks.filter(item => !item.task.completed && !item.task.archived && item.category === "soon" && item.task.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const futureTasks = categorizedTasks.filter(item => !item.task.completed && !item.task.archived && item.category === "future" && item.task.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const completedTasks = categorizedTasks.filter(item => item.task.completed && !item.task.archived && item.task.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const archivedTasks = categorizedTasks.filter(item => item.task.archived && item.task.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const [showArchived, setShowArchived] = React.useState(false);

  return (
    <div className="w-full">
      {/* Greeting Section */}
      <section className="mb-8 text-left">
        <h1 className="font-headline text-left font-extrabold text-slate-800 text-3xl sm:text-4xl uppercase tracking-tight mb-1 border-[groove] not-italic no-underline -ml-[3px]">
          TAKE A BREATH, {userName}.
        </h1>
        <p className="font-body text-slate-500 text-base sm:text-lg">
          Here's what's next on your path forward.
        </p>
        
        {/* Search Bar */}
        <div className="mt-6 relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
          <input 
            type="text" 
            placeholder="Search tasks..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-base sm:text-sm font-body text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-slate-300 transition-all shadow-sm"
          />
        </div>
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

      {/* GAMIFICATION & AI PLANNER ROW */}
      <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6 font-sans">
        
        {/* Gamification Panel */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-left flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500 font-bold text-lg">workspace_premium</span>
                <h2 className="font-headline text-xs font-black text-slate-700 uppercase tracking-widest">
                  Productivity Arena
                </h2>
              </div>
              <span className="bg-amber-100 text-amber-800 font-mono text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Level {Math.floor(streakStats.totalCompleted / 3) + 1}
              </span>
            </div>

            {/* Streak & Completion Stats */}
            <div className="grid grid-cols-3 gap-3 mb-5 bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
              <div>
                <span className="block text-xl font-black text-slate-800 leading-none flex items-center justify-center gap-0.5">
                  {streakStats.currentStreak} <span className="text-amber-500 text-sm">🔥</span>
                </span>
                <span className="text-slate-400 font-mono text-[8px] uppercase tracking-wider block mt-1">Active Streak</span>
              </div>
              <div>
                <span className="block text-xl font-black text-slate-800 leading-none flex items-center justify-center gap-0.5">
                  {streakStats.bestStreak} <span className="text-amber-500 text-sm">⭐</span>
                </span>
                <span className="text-slate-400 font-mono text-[8px] uppercase tracking-wider block mt-1">Best Streak</span>
              </div>
              <div>
                <span className="block text-xl font-black text-slate-800 leading-none flex items-center justify-center gap-0.5">
                  {streakStats.totalCompleted} <span className="text-amber-500 text-sm">🏆</span>
                </span>
                <span className="text-slate-400 font-mono text-[8px] uppercase tracking-wider block mt-1">Resolved Tasks</span>
              </div>
            </div>

            {/* Badges Collection */}
            <div className="space-y-2.5">
              <h3 className="font-headline text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Earned Badges
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {badges.map(badge => (
                  <div
                    key={badge.id}
                    className={`relative flex flex-col items-center justify-center p-2 rounded-lg border text-center group cursor-help transition-all ${
                      badge.active 
                        ? 'bg-amber-50/55 border-amber-200 text-amber-600 scale-100' 
                        : 'bg-slate-50 border-slate-100 text-slate-300 opacity-40 grayscale'
                    }`}
                  >
                    <span className="material-symbols-outlined text-xl">{badge.icon}</span>
                    
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-20 w-44 bg-slate-800 text-white text-[10px] p-2 rounded-lg shadow-md font-sans text-left pointer-events-none transition-all border border-slate-700">
                      <p className="font-bold text-amber-400 uppercase tracking-wide mb-0.5">{badge.name}</p>
                      <p className="text-slate-200 leading-snug">{badge.description}</p>
                      {!badge.active && (
                        <p className="font-mono text-[8px] text-rose-300 uppercase mt-1 font-bold">🔒 Locked</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Audio Tester */}
          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Tone System</span>
            {notificationPermission === "default" ? (
              <button
                type="button"
                onClick={requestNotificationPermission}
                className="flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[11px]">notifications</span>
                <span>Enable Push Notifications</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={playNudgeChime}
                className="flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-wider text-slate-600 hover:text-black bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[11px]">volume_up</span>
                <span>Test Audio Nudge</span>
              </button>
            )}
          </div>
        </div>

        {/* AI "Plan My Day" Scheduler Panel */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-left flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-500 font-bold text-lg">psychology</span>
                <h2 className="font-headline text-xs font-black text-slate-700 uppercase tracking-widest">
                  AI Daily Scheduler
                </h2>
              </div>
              <button
                type="button"
                disabled={isTimelineLoading}
                onClick={handlePlanMyDay}
                className={`flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-mono text-[9px] uppercase font-bold tracking-wider active:scale-95 transition-all cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed`}
              >
                {isTimelineLoading ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent animate-spin rounded-full mr-0.5"></div>
                    <span>Sequencing...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[12px]">sync</span>
                    <span>{timeline.length > 0 ? "Re-Plan Day" : "Plan My Day"}</span>
                  </>
                )}
              </button>
            </div>

            {/* Timeline sequence flow */}
            {isTimelineLoading ? (
              <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent animate-spin rounded-full"></div>
                <p className="font-mono text-[9px] uppercase font-bold tracking-wider text-indigo-700">
                  Gemini is evaluating task deadlines...
                </p>
              </div>
            ) : timeline.length === 0 ? (
              <div className="border border-slate-150 border-dashed rounded-xl p-5 text-center space-y-2">
                <p className="font-body text-slate-500 text-xs">
                  Create high-agency focus structures. Click "Plan My Day" to sequence your active objectives into a beautiful daily timeline.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[175px] overflow-y-auto pr-1">
                {timelineError && (
                  <p className="font-mono text-[8px] text-amber-600 font-bold uppercase tracking-wider mb-2">
                    ⚠️ {timelineError}
                  </p>
                )}
                <div className="relative border-l border-slate-100 pl-4 ml-2 space-y-4">
                  {timeline.map((block, idx) => {
                    return (
                      <div key={idx} className="relative text-left">
                        {/* Timeline Node Point */}
                        <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 ${
                          block.type === "focus" ? "border-indigo-600 bg-white" : "border-slate-400 bg-white"
                        }`} />
                        
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-mono text-[10px] font-black text-slate-800">{block.time}</span>
                          <span className="text-[8px] font-mono uppercase bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                            {block.duration}
                          </span>
                        </div>
                        <p className="text-slate-600 text-[11px] font-body font-medium mt-1 leading-relaxed">
                          {block.activity}
                        </p>
                        
                        {block.tasks && block.tasks.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {block.tasks.map((taskTitle: string, tIdx: number) => (
                              <span
                                key={tIdx}
                                className="text-[8px] font-mono font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100/40"
                              >
                                {taskTitle}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span>Powered by Gemini 3.5</span>
            {timeline.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTimeline([]);
                  localStorage.removeItem("nudge_ai_timeline");
                }}
                className="text-[9px] hover:text-black font-bold uppercase transition-all cursor-pointer"
              >
                Clear Plan
              </button>
            )}
          </div>
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
                        <TaskProgressRing subtasks={task.subtasks} />
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
                        <TaskProgressRing subtasks={task.subtasks} />
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
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {urgentTasks.map(({ task, timeLabel }) => {
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
                      <TaskProgressRing subtasks={task.subtasks} />
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
                      <TaskProgressRing subtasks={task.subtasks} />
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
                      <TaskProgressRing subtasks={task.subtasks} />
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
        <h2 className="font-headline text-xs font-bold text-[#695555] mb-4 uppercase tracking-widest">
          Resolved & Completed
        </h2>
        {completedTasks.length === 0 ? (
          <div className="bg-slate-50/30 border border-slate-200 border-dashed rounded-xl p-6 text-center space-y-2.5 animate-fade-in">
            <div className="mx-auto w-10 h-10 bg-slate-100/60 rounded-full flex items-center justify-center text-slate-400">
              <span className="material-symbols-outlined text-xl">verified</span>
            </div>
            <div className="space-y-1">
              <h3 className="font-headline text-[11px] font-bold text-slate-605 uppercase tracking-wider">No Resolved Items Yet</h3>
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
                      <TaskProgressRing subtasks={task.subtasks} />
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

      {/* ARCHIVED TASKS SECTION */}
      <section className="mb-24 opacity-75" id="section-archived">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-xs font-bold text-[#695555] uppercase tracking-widest flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">archive</span>
            <span>Archived Backlog ({archivedTasks.length})</span>
          </h2>
          {archivedTasks.length > 0 && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="text-slate-500 hover:text-black font-mono text-[10px] uppercase font-bold tracking-wider cursor-pointer bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-all shadow-xs"
            >
              {showArchived ? "Hide Archived" : "Show Archived"}
            </button>
          )}
        </div>

        {archivedTasks.length === 0 ? (
          <div className="bg-slate-50/30 border border-slate-200 border-dashed rounded-xl p-6 text-center space-y-1 animate-fade-in">
            <h3 className="font-headline text-[11px] font-bold text-slate-605 uppercase tracking-wider">No Archived Items</h3>
            <p className="text-[10px] font-mono text-slate-400 uppercase">You can archive tasks from their detail pages.</p>
          </div>
        ) : showArchived ? (
          <div className="space-y-2 animate-fade-in">
            {archivedTasks.map(({ task }) => (
              <div
                key={task.id}
                className="task-card bg-zinc-50 border border-zinc-200 rounded-xl p-3 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 flex-1 overflow-hidden">
                  <span className="material-symbols-outlined text-zinc-400 text-lg">archive</span>
                  <div className="truncate text-left">
                    <h3 className="font-headline text-sm font-semibold text-zinc-650 uppercase tracking-tight truncate">
                      {task.title}
                    </h3>
                    <div className="flex items-center gap-2 text-[9px] text-slate-400 uppercase font-mono">
                      <TaskProgressRing subtasks={task.subtasks} />
                      <span>{task.project}</span>
                      <span>•</span>
                      <span>Archived</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Restore button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onUpdateTask) {
                        onUpdateTask({ ...task, archived: false });
                      }
                    }}
                    title="Restore Task"
                    className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors cursor-pointer flex items-center"
                  >
                    <span className="material-symbols-outlined text-sm">unarchive</span>
                  </button>

                  {/* Delete permanently button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm("Are you sure you want to permanently delete this task? This action cannot be undone.")) {
                        if (onDeleteTask) {
                          onDeleteTask(task.id);
                        }
                      }
                    }}
                    title="Delete Permanently"
                    className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg text-slate-400 transition-colors cursor-pointer flex items-center"
                  >
                    <span className="material-symbols-outlined text-sm">delete_forever</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-slate-50/20 border border-slate-200/50 rounded-xl py-3 px-4 text-center">
            <button 
              onClick={() => setShowArchived(true)}
              className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-black cursor-pointer transition-all"
            >
              Click to view {archivedTasks.length} archived items
            </button>
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

      {/* AI Chatbot Trigger & Window */}
      <Chatbot />
    </div>
  );
}
