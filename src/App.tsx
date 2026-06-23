import React, { useState, useEffect } from "react";
import { Task } from "./types";
import { getTaskUrgencyDetails } from "./utils";
import Dashboard from "./components/Dashboard";
import TaskDetail from "./components/TaskDetail";
import AddTask from "./components/AddTask";
import Settings from "./components/Settings";
import Analytics from "./components/Analytics";
import { googleSignIn, logoutGoogle, initAuth } from "./firebase";
import { fetchUpcomingEvents, CalendarEvent } from "./calendarService";

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<"dashboard" | "analytics" | "add_task" | "settings">("dashboard");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [userName, setUserName] = useState("Alex");
  const [showNotifications, setShowNotifications] = useState(false);

  // Online/Offline tracking state
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Google Calendar Integration State
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalEvents, setGcalEvents] = useState<CalendarEvent[]>([]);
  const [gcalUserEmail, setGcalUserEmail] = useState<string | null>(null);
  const [gcalLoadingEvents, setGcalLoadingEvents] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  // Fetch upcoming timeline from user's primary calendar
  const loadGcalEvents = async (token: string) => {
    setGcalLoadingEvents(true);
    setCalendarError(null);
    try {
      const events = await fetchUpcomingEvents(token, 10);
      setGcalEvents(events);
      setGcalConnected(true);
    } catch (err: any) {
      console.error("Error loading calendar events:", err);
      setCalendarError("Session expired. Please reconnect Google Calendar to sync conflicts.");
      setGcalConnected(false);
    } finally {
      setGcalLoadingEvents(false);
    }
  };

  // Google Sign-In with Calendar popup
  const handleConnectGcal = async () => {
    try {
      setCalendarError(null);
      const res = await googleSignIn();
      if (res) {
        setGcalConnected(true);
        setGcalUserEmail(res.user.email);
        await loadGcalEvents(res.accessToken);
      }
    } catch (err: any) {
      console.error("Google Auth login error:", err);
      setCalendarError(err.message || "Failed to authenticate with Google Calendar.");
    }
  };

  // Disconnect Google Calendar
  const handleDisconnectGcal = async () => {
    try {
      await logoutGoogle();
      setGcalConnected(false);
      setGcalEvents([]);
      setGcalUserEmail(null);
      setCalendarError(null);
    } catch (err) {
      console.error("Google disconnect error:", err);
    }
  };

  // Synchronize Google Auth tokens on mount and active sessions
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGcalUserEmail(user.email);
        loadGcalEvents(token);
      },
      () => {
        if (localStorage.getItem("nudge_gcal_connected") === "true") {
          setGcalConnected(true);
        } else {
          setGcalConnected(false);
        }
      }
    );
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Initialize and load from local storage
  useEffect(() => {
    // 1. Immediate local cache load to guarantee ultra-fast, skeletonless UI
    const savedTasks = localStorage.getItem("nudge_tasks");
    const savedName = localStorage.getItem("nudge_username");
    
    if (savedTasks) {
      try {
        const parsed = JSON.parse(savedTasks);
        if (Array.isArray(parsed)) {
          const localTasks = parsed.map((t: any) => ({
            ...t,
            subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
          }));
          setTasks(localTasks);
        }
      } catch (err) {
        console.error("Local storage decode error:", err);
      }
    }
    if (savedName) {
      setUserName(savedName);
    }
  }, []);

  // Save state locally
  const saveTasksState = async (newTasks: Task[]) => {
    setTasks(newTasks);
    localStorage.setItem("nudge_tasks", JSON.stringify(newTasks));
  };

  const saveUserNameState = async (newName: string) => {
    setUserName(newName);
    localStorage.setItem("nudge_username", newName);
  };

  // Toggle checklist complete
  const handleToggleComplete = async (id: string, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation(); // prevent opening task details
    
    const updated = tasks.map(task => {
      if (task.id === id) {
        const nextCompleted = !task.completed;
        return {
          ...task,
          completed: nextCompleted,
          completedAt: nextCompleted ? new Date().toISOString().split('T')[0] : undefined,
        };
      }
      return task;
    });

    setTasks(updated);
    localStorage.setItem("nudge_tasks", JSON.stringify(updated));
  };

  // Single task updated from details panel in real-time
  const handleUpdateTask = async (updatedTask: Task) => {
    setTasks(prevTasks => {
      if (!prevTasks.some(t => t.id === updatedTask.id)) {
        return prevTasks; // It was deleted, do not resurrect!
      }
      const updated = prevTasks.map(t => {
        if (t.id === updatedTask.id) {
          const subtasks = (updatedTask.subtasks && updatedTask.subtasks.length > 0) 
            ? updatedTask.subtasks 
            : (t.subtasks && t.subtasks.length > 0 ? t.subtasks : []);
          
          const aiNudge = updatedTask.aiNudge !== undefined ? updatedTask.aiNudge : t.aiNudge;
          const aiBreakdownGenerated = updatedTask.aiBreakdownGenerated !== undefined ? updatedTask.aiBreakdownGenerated : t.aiBreakdownGenerated;
          const completed = updatedTask.completed !== undefined ? updatedTask.completed : t.completed;
          const completedAt = updatedTask.completed !== undefined 
            ? (updatedTask.completed ? (updatedTask.completedAt || new Date().toISOString().split('T')[0]) : undefined)
            : t.completedAt;

          return {
            ...t,
            ...updatedTask,
            subtasks,
            aiNudge,
            aiBreakdownGenerated,
            completed,
            completedAt
          };
        }
        return t;
      });
      localStorage.setItem("nudge_tasks", JSON.stringify(updated));
      return updated;
    });
  };

  // Task deleted
  const handleDeleteTask = async (id: string) => {
    const filtered = tasks.filter(t => t.id !== id);
    setTasks(filtered);
    localStorage.setItem("nudge_tasks", JSON.stringify(filtered));
    setSelectedTaskId(null);
    setActiveTab("dashboard");
  };

  // Add a new task submission
  const handleAddTask = async (newTaskData: Omit<Task, "id" | "completed" | "subtasks">) => {
    const freshTask: Task = {
      ...newTaskData,
      id: `task-${Date.now()}`,
      completed: false,
      subtasks: [],
    };

    const updated = [freshTask, ...tasks];
    setTasks(updated);
    localStorage.setItem("nudge_tasks", JSON.stringify(updated));
    setActiveTab("dashboard");
    setSelectedTaskId(null);
  };

  // Purge entire task database
  const handleClearAllTasks = async () => {
    await saveTasksState([]);
    setSelectedTaskId(null);
    setActiveTab("dashboard");
  };

  // Calculate high priority nudge alerts to display in notifications bell icon
  const urgentNudgeList = tasks.filter(task => {
    if (task.completed) return false;
    const details = getTaskUrgencyDetails(task);
    const subtasksList = task.subtasks || [];
    const hasNoCompletedSubtasks = subtasksList.length === 0 || !subtasksList.some(s => s.completed);
    return details.category === "urgent" && hasNoCompletedSubtasks;
  });


  // Safe navigation proxy
  const handleNavigateToTab = (tab: "dashboard" | "analytics" | "add_task" | "settings") => {
    setActiveTab(tab);
    setSelectedTaskId(null); // Clear selected item when toggling tabs
  };

  // Select task which automatically opens detail overlay
  const handleSelectTask = (id: string) => {
    setSelectedTaskId(id);
  };

  // Resolve active task
  const activeSelectedTask = tasks.find(t => t.id === selectedTaskId);

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-black flex flex-col font-sans selection:bg-black selection:text-white">
      {/* GLOBAL HEADER BAR */}
      <header className="w-full top-0 sticky z-40 bg-black text-white h-16 flex items-center justify-between px-4 sm:px-6 border-b border-zinc-800 shadow-none">
        <div 
          onClick={() => handleNavigateToTab("dashboard")}
          className="flex items-center cursor-pointer select-none group"
          title="Nudge Pro"
        >
          {/* Stylish N Alphabet Only */}
          <div className="h-10 w-10 bg-white text-black font-extrabold flex items-center justify-center rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.5)] border border-zinc-200 group-hover:bg-zinc-100 group-hover:scale-105 active:scale-95 transition-all duration-300 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-black"></div>
            <span className="text-2xl font-serif italic font-black tracking-tighter leading-none select-none pl-[2px]">
              N
            </span>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-3">
          {/* Notifications Trigger */}
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Toggle pending warnings drawer"
            className="p-2 border border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white rounded-lg transition-colors relative cursor-pointer"
          >
            <span className="material-symbols-outlined text-white block text-xl">notifications</span>
          </button>
        </div>
      </header>

      {/* NOTIFICATIONS OVERLAY / DRAWER */}
      {showNotifications && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-end p-4 sm:p-6 animate-fade-in">
          {/* Backdrop closer proxy */}
          <div className="absolute inset-0 cursor-pointer" onClick={() => setShowNotifications(false)} />
          
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-6 relative z-10 shadow-2xl divide-y divide-slate-100 text-slate-805">
            <div className="flex items-center justify-between pb-3 mb-4">
              <h4 className="font-headline font-bold text-black uppercase tracking-wide text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-black font-bold">notifications_active</span>
                <span>Active Messages ({urgentNudgeList.length})</span>
              </h4>
              <button
                onClick={() => setShowNotifications(false)}
                className="text-slate-400 hover:text-slate-600 uppercase font-mono text-[10px] tracking-wider cursor-pointer font-bold"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 pt-4 max-h-[350px] overflow-y-auto hide-scrollbar">
              {urgentNudgeList.length === 0 ? (
                <p className="font-mono text-xs text-slate-400 uppercase tracking-widest text-center py-6">
                  0 urgency deadlocks. All systems clear.
                </p>
              ) : (
                urgentNudgeList.map(task => (
                  <div 
                    key={task.id}
                    onClick={() => {
                      setSelectedTaskId(task.id);
                      setShowNotifications(false);
                    }}
                    className="group bg-slate-50 hover:bg-zinc-100 border border-zinc-200 hover:border-black p-3 rounded-lg transition-all cursor-pointer"
                  >
                    <div className="mb-1 text-slate-500 font-mono text-[10px] uppercase font-bold tracking-wider">
                      Project: {task.project}
                    </div>
                    <p className="font-headline font-bold text-black text-sm uppercase max-w-[240px] truncate leading-tight group-hover:text-black">
                      {task.title}
                    </p>
                    <p className="font-mono text-[9px] text-slate-500 uppercase tracking-wider mt-1">
                      No completed subtasks! Due today.
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 mt-4 text-center">
              <p className="font-mono text-[8px] text-slate-400 uppercase leading-normal">
                Nudges are compiled automatically using AI. Check task parameters to update alerts.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CORE CONTENT STAGE */}
      <main className="flex-1 w-full max-w-[800px] mx-auto px-4 py-8">
        {activeSelectedTask ? (
          <TaskDetail
            task={activeSelectedTask}
            onGoBack={() => setSelectedTaskId(null)}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            gcalEvents={gcalEvents}
            gcalConnected={gcalConnected}
          />
        ) : activeTab === "dashboard" ? (
          <Dashboard
            tasks={tasks}
            onToggleComplete={handleToggleComplete}
            onSelectTask={handleSelectTask}
            onNavigateToTab={handleNavigateToTab}
            userName={userName}
            gcalEvents={gcalEvents}
            gcalConnected={gcalConnected}
            gcalUserEmail={gcalUserEmail}
            onConnectGcal={handleConnectGcal}
            onDisconnectGcal={handleDisconnectGcal}
            gcalLoadingEvents={gcalLoadingEvents}
            calendarError={calendarError}
          />
        ) : activeTab === "analytics" ? (
          <Analytics
            tasks={tasks}
            userName={userName}
          />
        ) : activeTab === "add_task" ? (
          <AddTask
            onAddTask={handleAddTask}
            onCancel={() => setActiveTab("dashboard")}
            gcalEvents={gcalEvents}
            gcalConnected={gcalConnected}
          />
        ) : (
          <Settings
            userName={userName}
            onUpdateUserName={saveUserNameState}
            onClearAllTasks={handleClearAllTasks}
            totalTasksCount={tasks.length}
            onImportTasks={saveTasksState}
          />
        )}
      </main>

      {/* GLOBAL PERSISTENT BOTTOM NAVIGATION RAILS */}
      <nav className="fixed bottom-0 left-0 w-full z-40 flex justify-around items-center px-4 py-3 pb-safe bg-black text-white border-t border-zinc-900 shadow-none">
        {/* Dashboard Tab */}
        <button
          onClick={() => handleNavigateToTab("dashboard")}
          className={`flex flex-col items-center justify-center py-1 px-4 sm:px-6 transition-all duration-150 rounded-lg cursor-pointer ${
            activeTab === "dashboard" && !activeSelectedTask
              ? "bg-zinc-900 text-white font-bold"
              : "text-zinc-400 hover:text-white hover:bg-zinc-900"
          }`}
        >
          <span 
            className="material-symbols-outlined text-[20px] sm:text-[22px]"
            style={{ fontVariationSettings: activeTab === "dashboard" && !activeSelectedTask ? "'FILL' 1" : "'FILL' 0" }}
          >
            dashboard
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider mt-0.5">
            Dashboard
          </span>
        </button>

        {/* Insights Tab */}
        <button
          onClick={() => handleNavigateToTab("analytics")}
          className={`flex flex-col items-center justify-center py-1 px-4 sm:px-6 transition-all duration-150 rounded-lg cursor-pointer ${
            activeTab === "analytics"
              ? "bg-zinc-900 text-white font-bold"
              : "text-zinc-400 hover:text-white hover:bg-zinc-900"
          }`}
        >
          <span 
            className="material-symbols-outlined text-[20px] sm:text-[22px]"
            style={{ fontVariationSettings: activeTab === "analytics" ? "'FILL' 1" : "'FILL' 0" }}
          >
            insights
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider mt-0.5">
            Insights
          </span>
        </button>

        {/* Add Task Tab */}
        <button
          onClick={() => handleNavigateToTab("add_task")}
          className={`flex flex-col items-center justify-center py-1 px-4 sm:px-6 transition-all duration-150 rounded-lg cursor-pointer ${
            activeTab === "add_task" || activeSelectedTask
              ? "bg-zinc-900 text-white font-bold"
              : "text-zinc-400 hover:text-white hover:bg-zinc-900"
          }`}
        >
          <span
            className="material-symbols-outlined text-[20px] sm:text-[22px]"
            style={{ fontVariationSettings: activeTab === "add_task" ? "'FILL' 1" : "'FILL' 0" }}
          >
            add_circle
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider mt-0.5">
            Add Task
          </span>
        </button>

        {/* Settings Tab */}
        <button
          onClick={() => handleNavigateToTab("settings")}
          className={`flex flex-col items-center justify-center py-1 px-4 sm:px-6 transition-all duration-150 rounded-lg cursor-pointer ${
            activeTab === "settings"
              ? "bg-zinc-900 text-white font-bold"
              : "text-zinc-400 hover:text-white hover:bg-zinc-900"
          }`}
        >
          <span 
            className="material-symbols-outlined text-[20px] sm:text-[22px]"
            style={{ fontVariationSettings: activeTab === "settings" ? "'FILL' 1" : "'FILL' 0" }}
          >
            settings
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider mt-0.5">
            Settings
          </span>
        </button>
      </nav>
    </div>
  );
}
