import React, { useState, useEffect } from "react";
import { Task } from "./types";
import { generateInitialTasks, getTaskUrgencyDetails } from "./utils";
import Dashboard from "./components/Dashboard";
import TaskDetail from "./components/TaskDetail";
import AddTask from "./components/AddTask";
import Settings from "./components/Settings";

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<"dashboard" | "add_task" | "settings">("dashboard");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [userName, setUserName] = useState("Alex");
  const [showNotifications, setShowNotifications] = useState(false);

  // Initialize and load from local storage
  useEffect(() => {
    const savedTasks = localStorage.getItem("nudge_tasks");
    const savedName = localStorage.getItem("nudge_username");

    if (savedTasks) {
      try {
        const parsed = JSON.parse(savedTasks);
        if (Array.isArray(parsed)) {
          const sanitized = parsed.map((t: any) => ({
            ...t,
            subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
          }));
          setTasks(sanitized);
        } else {
          setTasks([]);
        }
      } catch (err) {
        setTasks([]);
      }
    } else {
      // Empty by default for new users, no auto-seeding demo tasks
      setTasks([]);
      localStorage.setItem("nudge_tasks", JSON.stringify([]));
    }

    if (savedName) {
      setUserName(savedName);
    }
  }, []);

  // Save to local storage whenever state changes
  const saveTasksState = (newTasks: Task[]) => {
    setTasks(newTasks);
    localStorage.setItem("nudge_tasks", JSON.stringify(newTasks));
  };

  const saveUserNameState = (newName: string) => {
    setUserName(newName);
    localStorage.setItem("nudge_username", newName);
  };

  // Toggle checklist complete
  const handleToggleComplete = (id: string, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation(); // prevent opening task details
    setTasks(prevTasks => {
      const updated = prevTasks.map(task => {
        if (task.id === id) {
          return {
            ...task,
            completed: !task.completed,
          };
        }
        return task;
      });
      localStorage.setItem("nudge_tasks", JSON.stringify(updated));
      return updated;
    });
  };

  // Single task updated from details panel in real-time
  const handleUpdateTask = (updatedTask: Task) => {
    setTasks(prevTasks => {
      if (!prevTasks.some(t => t.id === updatedTask.id)) {
        return prevTasks; // It was deleted, do not resurrect!
      }
      const updated = prevTasks.map(t => {
        if (t.id === updatedTask.id) {
          // If the incoming update clobbers subtasks back to empty string when they were already generated, ignore that clobbering!
          const subtasks = (updatedTask.subtasks && updatedTask.subtasks.length > 0) 
            ? updatedTask.subtasks 
            : (t.subtasks && t.subtasks.length > 0 ? t.subtasks : []);
          
          const aiNudge = updatedTask.aiNudge !== undefined ? updatedTask.aiNudge : t.aiNudge;
          const aiBreakdownGenerated = updatedTask.aiBreakdownGenerated !== undefined ? updatedTask.aiBreakdownGenerated : t.aiBreakdownGenerated;
          const completed = updatedTask.completed !== undefined ? updatedTask.completed : t.completed;

          return {
            ...t,
            ...updatedTask,
            subtasks,
            aiNudge,
            aiBreakdownGenerated,
            completed
          };
        }
        return t;
      });
      localStorage.setItem("nudge_tasks", JSON.stringify(updated));
      return updated;
    });
  };

  // Task deleted
  const handleDeleteTask = (id: string) => {
    setTasks(prevTasks => {
      const filtered = prevTasks.filter(t => t.id !== id);
      localStorage.setItem("nudge_tasks", JSON.stringify(filtered));
      return filtered;
    });
    setSelectedTaskId(null);
    setActiveTab("dashboard");
  };

  // Add a new task submission
  const handleAddTask = (newTaskData: Omit<Task, "id" | "completed" | "subtasks">) => {
    const freshTask: Task = {
      ...newTaskData,
      id: `task-${Date.now()}`,
      completed: false,
      subtasks: [],
    };
    setTasks(prevTasks => {
      const updated = [freshTask, ...prevTasks];
      localStorage.setItem("nudge_tasks", JSON.stringify(updated));
      return updated;
    });
    setActiveTab("dashboard");
    setSelectedTaskId(null);
  };

  // Reset demo suites
  const handleResetToDemo = () => {
    const demoTasks = generateInitialTasks();
    saveTasksState(demoTasks);
    setSelectedTaskId(null);
    setActiveTab("dashboard");
  };

  // Purge entire task database
  const handleClearAllTasks = () => {
    saveTasksState([]);
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
  const handleNavigateToTab = (tab: "dashboard" | "add_task" | "settings") => {
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
          className="flex items-center gap-3 cursor-pointer select-none group"
        >
          {/* Grayscale profile logo */}
          <div className="w-9 h-9 overflow-hidden bg-slate-800 border border-slate-700 rounded-lg flex-shrink-0">
            <img
              alt="Alex's Profile"
              className="w-full h-full object-cover grayscale brightness-95 group-hover:brightness-110"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBtcVtXhPUO1EwNKC6Kg5QFO1AqPqd16osBpDsztNdxzho9_-G1x4zedvmkns_8OaJ4T8TDgp49INZkna2I4iZNfuc5iuOuD2wbvEQFqyDUdO5NgKiW38SvJNLqNFIDKJ07j5ky51KPLWH88Mo5EIgT3gZxzT8OVnKkpqAvv39Jx4QypGOI9op9wD2O4SIAHkqEdNAk7K1SVL-ZO43tZtHYNHd8AgKSKVhkHLsXaZ0lQIIVOlEmHjMwT12jiGJrsZYgzadAj3BiW9c_"
              referrerPolicy="no-referrer"
            />
          </div>
          <span className="font-headline text-lg sm:text-xl font-bold tracking-tight text-white uppercase leading-none">
            Nudge
          </span>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-2">
          {/* Notifications Trigger */}
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Toggle pending warnings drawer"
            className="p-2 border border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white rounded-lg transition-colors relative cursor-pointer"
          >
            <span className="material-symbols-outlined text-white block text-xl">notifications</span>
            {urgentNudgeList.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-white text-black border-2 border-black font-semibold font-mono text-[9px] w-5 h-5 flex items-center justify-center rounded-full animate-bounce">
                {urgentNudgeList.length}
              </span>
            )}
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
                    <div className="flex items-center justify-between mb-1">
                      <span className="bg-white text-slate-650 font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 border border-slate-200 rounded">
                        {task.project}
                      </span>
                      <span className="w-2 h-2 bg-black rounded-full animate-ping"></span>
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
          />
        ) : activeTab === "dashboard" ? (
          <Dashboard
            tasks={tasks}
            onToggleComplete={handleToggleComplete}
            onSelectTask={handleSelectTask}
            onNavigateToTab={handleNavigateToTab}
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
            onResetTasksToDemo={handleResetToDemo}
            onClearAllTasks={handleClearAllTasks}
            totalTasksCount={tasks.length}
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
