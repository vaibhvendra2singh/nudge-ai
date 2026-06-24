import React, { useState, useEffect } from "react";
import { Task } from "./types";
import { getTaskUrgencyDetails } from "./utils";
import Dashboard from "./components/Dashboard";
import Calendar from "./components/Calendar";
import TaskDetail from "./components/TaskDetail";
import AddTask from "./components/AddTask";
import Settings from "./components/Settings";
import Analytics from "./components/Analytics";
import ErrorBoundary from "./components/ErrorBoundary";
import InstallPrompt from "./components/InstallPrompt";
import { signInUserAnonymously, saveTask, deleteTask as deleteFirebaseTask, getTasks } from "./firebase";

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<"dashboard" | "calendar" | "analytics" | "add_task" | "settings">("dashboard");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [userName, setUserName] = useState("Alex");
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifiedTaskIds, setNotifiedTaskIds] = useState<Set<string>>(new Set());
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);

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

  const triggerBackgroundSync = async (task: Task, action: 'save' | 'delete') => {
    if (!cloudSyncEnabled || !isOnline) return;
    try {
      const userId = await signInUserAnonymously();
      if (action === 'save') {
        await saveTask(userId, task);
      } else {
        await deleteFirebaseTask(userId, task.id);
      }
    } catch (e) {
      console.error("Background sync failed for task", task.id, e);
    }
  };

  // Initialize and load from local storage
  useEffect(() => {
    const initApp = async () => {
      const savedTasks = localStorage.getItem("nudge_tasks");
      const savedName = localStorage.getItem("nudge_username");
      const savedNotified = localStorage.getItem("nudge_notified_tasks");
      const schemaVersion = localStorage.getItem("nudge_schema_version");
      const syncEnabledStr = localStorage.getItem("nudge_cloud_sync");
      
      let isSyncEnabled = false;
      if (syncEnabledStr === "true") {
        setCloudSyncEnabled(true);
        isSyncEnabled = true;
      }
      
      let localTasks: Task[] = [];
      if (savedTasks) {
        try {
          const parsed = JSON.parse(savedTasks);
          if (Array.isArray(parsed)) {
            localTasks = parsed.map((t: any) => ({
              ...t,
              subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
            }));
            
            if (schemaVersion !== "2") {
              localTasks = localTasks.map(t => ({
                ...t,
                project: t.project || "Task"
              }));
              localStorage.setItem("nudge_schema_version", "2");
              localStorage.setItem("nudge_tasks", JSON.stringify(localTasks));
            }

            setTasks(localTasks);
          }
        } catch (err) {
          console.error("Local storage decode error:", err);
        }
      } else {
        localStorage.setItem("nudge_schema_version", "2");
      }
      
      if (savedName) {
        setUserName(savedName);
      }
      if (savedNotified) {
        try {
          setNotifiedTaskIds(new Set(JSON.parse(savedNotified)));
        } catch (err) {
          console.error("Failed to parse notified tasks:", err);
        }
      }

      // If cloud sync is enabled, fetch latest from Firestore in background
      if (isSyncEnabled && navigator.onLine) {
        try {
          const userId = await signInUserAnonymously();
          const cloudTasks = await getTasks(userId);
          if (cloudTasks && cloudTasks.length > 0) {
            // merge or replace. A simple approach is just replace.
            setTasks(cloudTasks);
            localStorage.setItem("nudge_tasks", JSON.stringify(cloudTasks));
          }
        } catch(e) {
          console.error("Failed to fetch tasks on load:", e);
        }
      }

      setIsLoadingInitial(false);
    };

    setTimeout(initApp, 300);
  }, []);

  // Push notification trigger for Urgent Tasks
  useEffect(() => {
    const urgentTasks = tasks.filter(task => {
      if (task.completed || task.archived) return false;
      const details = getTaskUrgencyDetails(task);
      const subtasksList = task.subtasks || [];
      const hasNoCompletedSubtasks = subtasksList.length === 0 || !subtasksList.some(s => s.completed);
      return details.category === "urgent" && hasNoCompletedSubtasks;
    });

    if ("Notification" in window && Notification.permission === "granted") {
      let newlyNotified = false;
      const nextSet = new Set(notifiedTaskIds);
      
      urgentTasks.forEach(task => {
        if (!nextSet.has(task.id)) {
          try {
             new Notification("Urgent Task: Nudge!", {
               body: `"${task.title}" needs your attention today!`,
             });
             nextSet.add(task.id);
             newlyNotified = true;
          } catch (e) {
             console.error("Notification error:", e);
          }
        }
      });

      if (newlyNotified) {
        setNotifiedTaskIds(nextSet);
        localStorage.setItem("nudge_notified_tasks", JSON.stringify(Array.from(nextSet)));
      }
    }
  }, [tasks, notifiedTaskIds]);

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
    
    let updatedTask: Task | null = null;
    const updated = tasks.map(task => {
      if (task.id === id) {
        const nextCompleted = !task.completed;
        updatedTask = {
          ...task,
          completed: nextCompleted,
          completedAt: nextCompleted ? new Date().toISOString().split('T')[0] : undefined,
        };
        return updatedTask;
      }
      return task;
    });

    setTasks(updated);
    localStorage.setItem("nudge_tasks", JSON.stringify(updated));
    if (updatedTask) triggerBackgroundSync(updatedTask, 'save');
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
    triggerBackgroundSync(updatedTask, 'save');
  };

  // Task deleted
  const handleDeleteTask = async (id: string) => {
    const taskToDelete = tasks.find(t => t.id === id);
    const filtered = tasks.filter(t => t.id !== id);
    setTasks(filtered);
    localStorage.setItem("nudge_tasks", JSON.stringify(filtered));
    setSelectedTaskId(null);
    setActiveTab("dashboard");
    if (taskToDelete) triggerBackgroundSync(taskToDelete, 'delete');
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
    triggerBackgroundSync(freshTask, 'save');
  };

  // Purge entire task database
  const handleClearAllTasks = async () => {
    await saveTasksState([]);
    setSelectedTaskId(null);
    setActiveTab("dashboard");
  };

  // Calculate high priority nudge alerts to display in notifications bell icon
  const urgentNudgeList = tasks.filter(task => {
    if (task.completed || task.archived) return false;
    const details = getTaskUrgencyDetails(task);
    const subtasksList = task.subtasks || [];
    const hasNoCompletedSubtasks = subtasksList.length === 0 || !subtasksList.some(s => s.completed);
    return details.category === "urgent" && hasNoCompletedSubtasks;
  });


  // Safe navigation proxy
  const handleNavigateToTab = (tab: "dashboard" | "calendar" | "analytics" | "add_task" | "settings") => {
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
      <InstallPrompt />
      {/* GLOBAL HEADER BAR */}
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-40 text-white h-[62px] flex items-center justify-between shadow-none w-[375px] max-w-full mx-auto pt-0 pl-[10px] pr-4 mt-[3px] mb-0 border-0 rounded-[123px] bg-black">
        <div 
          onClick={() => handleNavigateToTab("dashboard")}
          className="flex items-center cursor-pointer select-none group ml-[20px] pl-0"
          title="Nudge Pro"
        >
          {/* Stylish N Alphabet Only */}
          <div className="h-10 w-10 pl-0 ml-0 bg-white text-black font-extrabold flex items-center justify-center rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.5)] border border-zinc-200 group-hover:bg-zinc-100 group-hover:scale-105 active:scale-95 transition-all duration-300 relative overflow-hidden">
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
            className="border border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white rounded-lg transition-colors relative cursor-pointer pt-[8px] pb-[8px] pl-[8px] pr-[8px] -ml-[3px] mr-[11px]"
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
        <ErrorBoundary>
          {isLoadingInitial ? (
            <div className="flex flex-col gap-6 w-full animate-pulse">
              <div className="h-12 bg-slate-200 rounded-lg w-1/2 mb-4"></div>
              <div className="grid grid-cols-3 gap-4">
                 <div className="h-24 bg-slate-200 rounded-xl"></div>
                 <div className="h-24 bg-slate-200 rounded-xl"></div>
                 <div className="h-24 bg-slate-200 rounded-xl"></div>
              </div>
              <div className="h-40 bg-slate-200 rounded-xl w-full"></div>
              <div className="h-20 bg-slate-200 rounded-xl w-full"></div>
            </div>
          ) : activeSelectedTask ? (
            <TaskDetail
              task={activeSelectedTask}
              allTasks={tasks}
              onGoBack={() => setSelectedTaskId(null)}
              onUpdateTask={handleUpdateTask}
              onDeleteTask={handleDeleteTask}
            />
          ) : activeTab === "dashboard" ? (
            <Dashboard
              tasks={tasks}
              onToggleComplete={handleToggleComplete}
              onSelectTask={handleSelectTask}
              onNavigateToTab={handleNavigateToTab}
              userName={userName}
            />
          ) : activeTab === "calendar" ? (
            <Calendar
              tasks={tasks}
              onSelectTask={handleSelectTask}
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
            />
          ) : (
            <Settings
              userName={userName}
              onUpdateUserName={saveUserNameState}
              onClearAllTasks={handleClearAllTasks}
              totalTasksCount={tasks.length}
              onImportTasks={saveTasksState}
              cloudSyncEnabled={cloudSyncEnabled}
              setCloudSyncEnabled={(enabled: boolean) => {
                setCloudSyncEnabled(enabled);
                localStorage.setItem("nudge_cloud_sync", enabled ? "true" : "false");
              }}
            />
          )}
        </ErrorBoundary>
      </main>

      {/* GLOBAL PERSISTENT BOTTOM NAVIGATION RAILS */}
      <nav 
        className="fixed bottom-[env(safe-area-inset-bottom,0px)] left-1/2 -translate-x-1/2 z-40 flex justify-between items-center px-1 py-1 bg-black text-white border-zinc-900 shadow-none h-[62.5938px] w-[95%] max-w-[375px] border-groove rounded-[30px] mt-0 mb-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 4px)', height: 'auto', minHeight: '62.5938px' }}
      >
        {/* Dashboard Tab */}
        <button
          onClick={() => handleNavigateToTab("dashboard")}
          className={`flex-1 flex flex-col items-center justify-center py-1 transition-all duration-150 rounded-[84px] cursor-pointer ${
            activeTab === "dashboard" && !activeSelectedTask
              ? "bg-zinc-900 text-white font-bold"
              : "text-zinc-400 hover:text-white hover:bg-zinc-900"
          }`}
        >
          <span 
            className="material-symbols-outlined text-[20px]"
            style={{ fontVariationSettings: activeTab === "dashboard" && !activeSelectedTask ? "'FILL' 1" : "'FILL' 0" }}
          >
            dashboard
          </span>
          <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-wider mt-0.5">
            Dashboard
          </span>
        </button>

        {/* Insights Tab */}
        <button
          onClick={() => handleNavigateToTab("analytics")}
          className={`flex-1 flex flex-col items-center justify-center py-1 transition-all duration-150 rounded-[84px] cursor-pointer ${
            activeTab === "analytics"
              ? "bg-zinc-900 text-white font-bold"
              : "text-zinc-400 hover:text-white hover:bg-zinc-900"
          }`}
        >
          <span 
            className="material-symbols-outlined text-[20px]"
            style={{ fontVariationSettings: activeTab === "analytics" ? "'FILL' 1" : "'FILL' 0" }}
          >
            insights
          </span>
          <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-wider mt-0.5">
            Insights
          </span>
        </button>

        {/* Calendar Tab */}
        <button
          onClick={() => handleNavigateToTab("calendar")}
          className={`flex-1 flex flex-col items-center justify-center py-1 transition-all duration-150 rounded-[84px] cursor-pointer ${
            activeTab === "calendar"
              ? "bg-zinc-900 text-white font-bold"
              : "text-zinc-400 hover:text-white hover:bg-zinc-900"
          }`}
        >
          <span 
            className="material-symbols-outlined text-[20px]"
            style={{ fontVariationSettings: activeTab === "calendar" ? "'FILL' 1" : "'FILL' 0" }}
          >
            calendar_month
          </span>
          <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-wider mt-0.5">
            Calendar
          </span>
        </button>

        {/* Add Task Tab */}
        <button
          onClick={() => handleNavigateToTab("add_task")}
          className={`flex-1 flex flex-col items-center justify-center py-1 transition-all duration-150 rounded-[84px] cursor-pointer ${
            activeTab === "add_task" || activeSelectedTask
              ? "bg-zinc-900 text-white font-bold"
              : "text-zinc-400 hover:text-white hover:bg-zinc-900"
          }`}
        >
          <span
            className="material-symbols-outlined text-[20px]"
            style={{ fontVariationSettings: activeTab === "add_task" ? "'FILL' 1" : "'FILL' 0" }}
          >
            add_circle
          </span>
          <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-wider mt-0.5">
            Add Task
          </span>
        </button>

        {/* Settings Tab */}
        <button
          onClick={() => handleNavigateToTab("settings")}
          className={`flex-1 flex flex-col items-center justify-center py-1 transition-all duration-150 rounded-[84px] cursor-pointer ${
            activeTab === "settings"
              ? "bg-zinc-900 text-white font-bold"
              : "text-zinc-400 hover:text-white hover:bg-zinc-900"
          }`}
        >
          <span 
            className="material-symbols-outlined text-[20px]"
            style={{ fontVariationSettings: activeTab === "settings" ? "'FILL' 1" : "'FILL' 0" }}
          >
            settings
          </span>
          <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-wider mt-0.5">
            Settings
          </span>
        </button>
      </nav>
    </div>
  );
}
