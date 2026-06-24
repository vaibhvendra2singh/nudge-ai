import React, { useState, useEffect } from "react";
import { Task, SubTask } from "../types";
import { getTaskUrgencyDetails, downloadICSFile } from "../utils";
import { CalendarEvent, checkDeadlineConflicts } from "../calendarService";

interface TaskDetailProps {
  task: Task;
  onGoBack: () => void;
  onUpdateTask: (updatedTask: Task) => void;
  onDeleteTask: (id: string) => void;
  gcalEvents?: CalendarEvent[];
  gcalConnected?: boolean;
}

export default function TaskDetail({
  task,
  onGoBack,
  onUpdateTask,
  onDeleteTask,
  gcalEvents = [],
  gcalConnected = false,
}: TaskDetailProps) {
  const [isNudgeLoading, setIsNudgeLoading] = useState(false);
  const [isBreakdownLoading, setIsBreakdownLoading] = useState(false);
  const [nudgeErrorMsg, setNudgeErrorMsg] = useState<string | null>(null);
  const [breakdownErrorMsg, setBreakdownErrorMsg] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Determine urgency parameters
  const urgency = getTaskUrgencyDetails(task);
  const isUrgent = urgency.category === "urgent";

  // check if there are no completed subtasks (either list is empty, or all are not completed)
  const subtasksList = task.subtasks || [];
  const hasNoCompletedSubtasks = subtasksList.length === 0 || !subtasksList.some(s => s.completed);
  
  // Decide if we should show the automatic "urgent nudge" message:
  // - Due within 24 hours of now (isUrgent)
  // - and no completed subtasks
  const isNudgeEligible = isUrgent && hasNoCompletedSubtasks && !task.completed;

  // Automate the live generation of both the Nudge and the Checklist on load/mount
  useEffect(() => {
    setNudgeErrorMsg(null);
    setBreakdownErrorMsg(null);

    // Only fetch if a nudge is eligible and hasn't already been generated/stored
    if (isNudgeEligible && !task.aiNudge) {
      triggerUrgentNudge();
    }

    // Automatically trigger fresh breakdown on load if no subtasks exist and we haven't already generated one for this task
    if (subtasksList.length === 0 && !task.aiBreakdownGenerated) {
      triggerBreakdown();
    }
  }, [task.id, isNudgeEligible, task.aiNudge, task.aiBreakdownGenerated, subtasksList.length]);

  // Calls server-side Gemini to get the intelligent Nudge
  const triggerUrgentNudge = async () => {
    setIsNudgeLoading(true);
    setNudgeErrorMsg(null);
    try {
      const response = await fetch("/api/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: task.title,
          details: task.details,
          priority: task.priority,
          deadline: task.deadline,
          hoursLeft: urgency.hoursLeft,
          subtasks: task.subtasks,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate intelligent nudge.");
      }

      const data = await response.json();
      onUpdateTask({
        ...task,
        aiNudge: data.nudge,
      });
    } catch (err: any) {
      console.error(err);
      setNudgeErrorMsg(err.message || "Could not retrieve nudge alert.");
    } finally {
      setIsNudgeLoading(false);
    }
  };

  // Calls server-side Gemini to trigger task Breakdown with full context including deadline
  const triggerBreakdown = async () => {
    setIsBreakdownLoading(true);
    setBreakdownErrorMsg(null);
    try {
      const response = await fetch("/api/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: task.title,
          details: task.details,
          project: task.project,
          priority: task.priority,
          deadline: task.deadline,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to break down task.");
      }

      const data = await response.json();
      
      // Convert list of strings to SubTask objects
      const generatedSubtasks: SubTask[] = (data.subtasks || []).map((stringTitle: string, index: number) => ({
        id: `gen-sub-${Date.now()}-${index}`,
        title: stringTitle,
        completed: false,
      }));

      // Update parent state
      onUpdateTask({
        ...task,
        subtasks: generatedSubtasks,
        aiBreakdownGenerated: true,
        // Reset the nudge if we generated new subtasks (which gives the user a clean slate)
        aiNudge: null, 
      });
    } catch (err: any) {
      console.error(err);
      setBreakdownErrorMsg(err.message || "Failed to reach breakdown generation.");
    } finally {
      setIsBreakdownLoading(false);
    }
  };

  // Toggle single subtask status
  const handleToggleSubtask = (subtaskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentSubtasks = task.subtasks || [];
    const updatedSubtasks = currentSubtasks.map(s => {
      if (s.id === subtaskId) {
        return { ...s, completed: !s.completed };
      }
      return s;
    });

    onUpdateTask({
      ...task,
      subtasks: updatedSubtasks,
    });
  };

  // Mark full task status complete/uncompleted
  const handleToggleTaskStatus = () => {
    onUpdateTask({
      ...task,
      completed: !task.completed,
    });
  };

  // Format priority helper labels
  const getPriorityLabel = (p: string) => {
    switch (p) {
      case "high": return { main: "High Agency", sub: "Focus deep-work required" };
      case "medium": return { main: "Secondary Focus", sub: "Standard operational pace" };
      default: return { main: "Low Leverage", sub: "Routine background execution" };
    }
  };

  const priorityMeta = getPriorityLabel(task.priority);

  // Check if everything is checked off
  const allCompleted = (task.subtasks || []).length > 0 && (task.subtasks || []).every(s => s.completed);

  return (
    <div className="w-full space-y-6 animate-fade-in text-left">
      {/* Back button row */}
      <div className="flex items-center justify-between">
        <button
          onClick={onGoBack}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-slate-800 hover:border-slate-300 transition-colors font-mono text-xs uppercase cursor-pointer shadow-sm"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Back to Dashboard</span>
        </button>
        {showDeleteConfirm ? (
          <div className="flex items-center gap-1.5 bg-zinc-100 border border-zinc-200 p-1 rounded-lg">
            <span className="font-mono text-[9px] uppercase font-bold text-zinc-800 px-1">Confirm delete?</span>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDeleteTask(task.id);
              }}
              className="px-2 py-1 bg-black text-white rounded font-mono text-[10px] font-bold uppercase cursor-pointer hover:bg-zinc-800 transition"
            >
              Yes
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowDeleteConfirm(false);
              }}
              className="px-2 py-1 bg-white border border-slate-200 text-slate-500 rounded font-mono text-[10px] uppercase cursor-pointer hover:bg-slate-50 transition"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowDeleteConfirm(true);
            }}
            className="px-3 py-1.5 bg-white border border-zinc-200 text-zinc-850 hover:bg-zinc-50 rounded-lg transition-colors font-mono text-xs uppercase cursor-pointer font-bold"
          >
            Delete Task
          </button>
        )}
      </div>

      {/* Task Header area */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-2">
        <div className="space-y-1">
          <h2 className="font-headline text-xl sm:text-2xl font-black text-slate-800 tracking-tight uppercase leading-snug break-words">
            {task.title}
          </h2>
          <div className="flex items-center gap-3 font-mono text-xs text-slate-500 uppercase font-semibold">
            <span>Project: {task.project || "General"}</span>
            {task.completed && (
              <>
                <span>•</span>
                <span className="text-zinc-600 font-bold">Resolved</span>
              </>
            )}
          </div>
        </div>
        {task.details && (
          <p className="font-body text-slate-600 text-sm sm:text-base leading-relaxed whitespace-pre-line border-l-4 border-slate-300 pl-4 py-1">
            {task.details}
          </p>
        )}
      </section>

      {/* AUTOMATIC URGENT NUDGE SECTION */}
      {isNudgeEligible && (
        <section className="nudge-box p-5 border border-zinc-200 rounded-xl hover:shadow-md transition-all shadow-sm relative overflow-hidden text-black">
          <div className="relative z-10 flex items-start gap-3">
            <div className="bg-black text-white p-1.5 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            </div>
            <div className="space-y-1 flex-1">
              <h4 className="font-headline text-[11px] font-black uppercase tracking-widest text-zinc-800">
                AI Driven Nudge
              </h4>
              
              {isNudgeLoading ? (
                <div className="flex items-center gap-2 py-1">
                  <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent animate-spin rounded-full"></div>
                  <span className="font-mono text-[10px] uppercase font-bold tracking-wider">Analyzing priority context...</span>
                </div>
              ) : nudgeErrorMsg ? (
                <div className="space-y-2 mt-1 select-none text-left">
                  <p className="font-body text-xs text-slate-500 font-medium leading-relaxed">
                    AI Nudge analysis is currently offline or rate-limited. Read the schedule metrics below, or attempt a quick recline.
                  </p>
                  <button
                    type="button"
                    onClick={triggerUrgentNudge}
                    className="flex items-center gap-1 inline-flex px-2.5 py-1 bg-black hover:bg-zinc-800 text-white rounded font-mono text-[9px] uppercase tracking-wider font-bold cursor-pointer transition-all active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[12px]">refresh</span>
                    <span>Retry Nudge Analysis</span>
                  </button>
                </div>
              ) : task.aiNudge ? (
                <p className="font-body text-sm font-semibold leading-relaxed leading-snug">
                  "{task.aiNudge}"
                </p>
              ) : (
                <p className="font-body text-sm font-semibold leading-relaxed leading-snug">
                  "Let's focus on the first small step to clear this off your list today."
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* AI BREAKDOWN ENGINE */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-black font-bold">auto_awesome</span>
            <h3 className="font-headline text-sm font-bold text-slate-800 uppercase tracking-wider">
              Generated Checklist
            </h3>
          </div>
          {subtasksList.length > 0 ? (
            <span className="font-mono text-[10px] text-slate-500 uppercase font-bold tracking-wider">
              {subtasksList.length} Step{subtasksList.length > 1 ? "s" : ""}
            </span>
          ) : (
            <span className="font-mono text-[10px] text-slate-400 uppercase font-semibold tracking-wider">
              Empty
            </span>
          )}
        </div>

        {/* Breakdown state controller */}
        {isBreakdownLoading ? (
          <div className="border border-dashed border-slate-200 bg-slate-50/50 p-8 rounded-lg text-center flex flex-col items-center justify-center space-y-3">
            <div className="w-6 h-6 border-2 border-black border-t-transparent animate-spin rounded-full"></div>
            <p className="font-mono text-[10px] uppercase font-bold tracking-wider text-slate-500">
              Generating active checklist items...
            </p>
          </div>
        ) : breakdownErrorMsg ? (
          <div className="border border-dashed border-slate-200 bg-red-50/10 p-6 rounded-lg text-center space-y-3">
            <p className="font-mono text-xs text-slate-650 font-bold uppercase tracking-wider">
              Checklist Generation Paused
            </p>
          </div>
        ) : subtasksList.length === 0 ? (
          <div className="border border-dashed border-slate-200 bg-slate-50 p-6 rounded-lg text-center space-y-3">
            <button
              onClick={triggerBreakdown}
              className="px-5 py-2.5 ai-gradient hover:opacity-90 active:scale-95 text-white font-bold text-xs uppercase tracking-wide rounded-lg transition-all cursor-pointer shadow-md inline-flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[16px]">expand</span>
              <span>AI Breakdown</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {subtasksList.map((sub, index) => (
              <div
                key={sub.id || `subtask-${index}`}
                onClick={(e) => handleToggleSubtask(sub.id, e)}
                className={`p-3 bg-slate-50/50 border border-slate-150 rounded-lg flex items-center gap-3 cursor-pointer hover:border-black hover:bg-white transition-all ${
                  sub.completed ? "opacity-50 line-through text-slate-400 bg-slate-50" : ""
                }`}
              >
                <div className="flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={sub.completed}
                    onChange={(e) => {}} // Controlled via key-click proxy
                    className="cursor-pointer"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`font-body text-sm font-medium ${sub.completed ? "text-slate-400" : "text-slate-700"} break-words`}>
                    {sub.title}
                  </span>
                </div>
                <span className="material-symbols-outlined text-slate-300 text-sm">chevron_right</span>
              </div>
            ))}

            {breakdownErrorMsg && (
              <div className="mt-3 p-3 bg-red-50/25 border border-red-200 rounded-lg text-left flex items-center justify-between gap-3 animate-fade-in">
                <div className="space-y-0.5">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-red-700 font-bold">Recompilation Limited</p>
                  <p className="text-[11px] text-slate-500">Failed to update. Re-attempt when ready.</p>
                </div>
                <button
                  type="button"
                  onClick={triggerBreakdown}
                  className="px-2.5 py-1.5 bg-black text-white hover:bg-zinc-800 rounded font-mono text-[9px] uppercase tracking-wider font-bold cursor-pointer transition-all flex items-center gap-0.5"
                >
                  <span className="material-symbols-outlined text-[12px]">refresh</span>
                  <span>Retry</span>
                </button>
              </div>
            )}

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={triggerBreakdown}
                disabled={isBreakdownLoading}
                className="font-mono text-[10px] text-black hover:text-zinc-600 underline font-bold uppercase cursor-pointer disabled:opacity-50"
              >
                Recompile breakdown checklist with AI
              </button>
            </div>
          </div>
        )}
      </section>

      {/* GOOGLE CALENDAR ADVISORY CONFLICT ALERT */}
      {gcalConnected && task.deadline && (() => {
        const conflicts = checkDeadlineConflicts(task.deadline, task.timeSlot || "17:00", gcalEvents);
        if (conflicts.length > 0) {
          return (
            <div className="mb-6 bg-amber-50/70 border border-amber-200 text-amber-800 p-4 rounded-xl flex items-start gap-3 text-left font-sans animate-fade-in shadow-xs">
              <span className="material-symbols-outlined text-amber-700 font-bold animate-pulse mt-0.5">warning</span>
              <div>
                <h4 className="font-bold uppercase tracking-wider text-[9px] font-mono mb-0.5">Calendar Conflict Identified</h4>
                <p className="text-xs font-semibold leading-relaxed">
                  This task's target deadline overlaps with <span className="font-bold underline">{conflicts.map(c => `'${c.event.summary || "Busy Slot"}'`).join(", ")}</span> on your Google Calendar.
                </p>
              </div>
            </div>
          );
        } else {
          return (
            <div className="mb-6 bg-emerald-50/30 border border-emerald-150 text-emerald-800 p-3 rounded-xl flex items-center gap-2.5 text-left text-xs font-sans animate-fade-in">
              <span className="material-symbols-outlined text-emerald-600 font-bold">check_circle</span>
              <p className="font-semibold">
                No scheduling conflicts!
              </p>
            </div>
          );
        }
      })()}

      {/* METADATA BLOCKS */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Deadline container */}
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm flex flex-col justify-between min-h-[120px]">
          <div className="flex justify-between items-start">
            <span className="material-symbols-outlined text-slate-400 text-[18px]">calendar_today</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Deadline Target</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 items-end justify-between">
            <div>
              <p className="text-lg font-bold text-slate-800 uppercase font-headline leading-tight">
                {task.deadline}
              </p>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                SLOT: {task.timeSlot || "17:00"} ({urgency.timeLabel})
              </p>
            </div>
            <button
              onClick={() => downloadICSFile(task)}
              title="Download calendar event (.ics)"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-mono text-[10px] uppercase font-bold tracking-wider hover:text-black hover:border-slate-300 cursor-pointer shadow-xs active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[14px]">calendar_add_on</span>
              <span>Sync to Calendar</span>
            </button>
          </div>
        </div>

        {/* Priority container */}
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm flex flex-col justify-between min-h-[120px]">
          <div className="flex justify-between items-start">
            <span className="material-symbols-outlined text-slate-400 text-[18px]">psychology</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Priority Class</span>
          </div>
          <div className="mt-2">
            <p className="text-lg font-bold text-slate-800 uppercase font-headline leading-tight">
              {priorityMeta.main}
            </p>
          </div>
        </div>
      </section>

      {/* CORE CONTROL FOOTER ACTIONS */}
      <footer className="pt-6 space-y-3 pb-24">
        <button
          onClick={handleToggleTaskStatus}
          className="w-full ai-gradient text-white font-headline text-base py-3.5 font-bold uppercase rounded-xl shadow-lg hover:opacity-95 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[20px]">
            {task.completed ? "undo" : (allCompleted ? "done_all" : "check_circle")}
          </span>
          <span>
            {task.completed ? "Mark Task as Incomplete" : (allCompleted ? "All Steps Done - Finish Task" : "Mark Task as Completed")}
          </span>
        </button>

        <button
          onClick={onGoBack}
          className="w-full border border-slate-200 text-slate-600 bg-white font-mono text-xs py-3 font-semibold uppercase hover:bg-slate-50 hover:text-slate-800 rounded-xl transition-colors cursor-pointer shadow-sm"
        >
          Keep in queue for later
        </button>
      </footer>
    </div>
  );
}
