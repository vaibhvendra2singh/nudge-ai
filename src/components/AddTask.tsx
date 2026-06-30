import React, { useState, useEffect } from "react";
import { Task } from "../types";
import { getSafeRedirectUrl } from "../supabase";

interface AddTaskProps {
  onAddTask: (newTask: Omit<Task, "id" | "completed" | "subtasks">) => void;
  onCancel: () => void;
}

export default function AddTask({ 
  onAddTask, 
  onCancel,
}: AddTaskProps) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [deadline, setDeadline] = useState("");
  const [timeSlot, setTimeSlot] = useState("14:30"); // default afternoon
  const [project, setProject] = useState("Work"); // Default project / tag
  const [customTagInput, setCustomTagInput] = useState("");
  const [showCustomTagField, setShowCustomTagField] = useState(false);
  const [availableTags, setAvailableTags] = useState(["Work", "Personal", "Deep Work", "Marketing"]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [naturalDeadline, setNaturalDeadline] = useState("");
  const [isParsingDeadline, setIsParsingDeadline] = useState(false);

  const isInitialMount = React.useRef(true);



  const parseDeadlineLocally = (text: string): { deadline: string; timeSlot: string } | null => {
    const normalized = text.toLowerCase().trim();
    if (!normalized) return null;

    const formatDate = (d: Date): string => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    const extractTime = (str: string): string => {
      if (str.includes("morning")) return "09:00";
      if (str.includes("afternoon")) return "14:30";
      if (str.includes("evening") || str.includes("night")) return "18:00";

      // Matches times like 6:30pm, 6:30 pm, 18:30, 18:30pm, 18:30 am
      const colonMatch = str.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/);
      if (colonMatch) {
        let hours = parseInt(colonMatch[1], 10);
        const minutes = colonMatch[2];
        const ampm = colonMatch[3];
        
        if (ampm) {
          if (ampm === "pm" && hours < 12) hours += 12;
          if (ampm === "am" && hours === 12) hours = 0;
        }
        return `${String(hours).padStart(2, "0")}:${minutes}`;
      }

      // Matches times like 6pm, 6 pm, 6am, 6 am, 18pm
      const ampmMatch = str.match(/(\d{1,2})\s*(am|pm)/);
      if (ampmMatch) {
        let hours = parseInt(ampmMatch[1], 10);
        const ampm = ampmMatch[2];
        if (ampm === "pm" && hours < 12) hours += 12;
        if (ampm === "am" && hours === 12) hours = 0;
        return `${String(hours).padStart(2, "0")}:00`;
      }

      // Matches "at 6" or "at 18"
      const atMatch = str.match(/at\s+(\d{1,2})/);
      if (atMatch) {
        let hours = parseInt(atMatch[1], 10);
        if (hours < 12 && str.includes("pm")) {
          hours += 12;
        } else if (hours < 12 && !str.includes("am") && hours >= 1 && hours <= 7) {
          hours += 12;
        }
        return `${String(hours).padStart(2, "0")}:00`;
      }

      return "17:00";
    };

    const targetDate = new Date();
    let matched = false;

    // Support "today", "tod", "tomorrow", "tmrw"
    if (normalized.includes("today") || normalized.startsWith("tod")) {
      matched = true;
    } else if (normalized.includes("tomorrow") || normalized.includes("tmrw")) {
      targetDate.setDate(targetDate.getDate() + 1);
      matched = true;
    } else {
      const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const shortDays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      
      let targetDayIndex = -1;
      for (let i = 0; i < days.length; i++) {
        if (normalized.includes(days[i]) || normalized.includes(shortDays[i])) {
          targetDayIndex = i;
          break;
        }
      }

      if (targetDayIndex !== -1) {
        const currentDayIndex = targetDate.getDay();
        let daysToAdd = targetDayIndex - currentDayIndex;
        
        if (normalized.includes("next")) {
          if (daysToAdd <= 0) daysToAdd += 7;
          daysToAdd += 7;
        } else {
          if (daysToAdd <= 0) {
            daysToAdd += 7;
          }
        }
        targetDate.setDate(targetDate.getDate() + daysToAdd);
        matched = true;
      }
    }

    if (matched) {
      return {
        deadline: formatDate(targetDate),
        timeSlot: extractTime(normalized)
      };
    }

    return null;
  };

  const handleParseDeadline = async () => {
    if (!naturalDeadline.trim()) return;
    setIsParsingDeadline(true);
    setErrorMessage(null);

    // Try parsing locally first for instantaneous offline response
    const localResult = parseDeadlineLocally(naturalDeadline);
    if (localResult) {
      setDeadline(localResult.deadline);
      setTimeSlot(localResult.timeSlot);
      setNaturalDeadline("");
      setIsParsingDeadline(false);
      return;
    }

    try {
      const response = await fetch("/api/gemini/parse-deadline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: naturalDeadline,
          currentDate: new Date().toISOString()
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.deadline) setDeadline(data.deadline);
        if (data.timeSlot) setTimeSlot(data.timeSlot);
        setNaturalDeadline("");
      } else {
        throw new Error("Failed to parse deadline.");
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("Could not parse deadline from text. Please use date picker.");
    } finally {
      setIsParsingDeadline(false);
    }
  };

  // Set default deadline date string to Today on mount
  useEffect(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    setDeadline(`${yyyy}-${mm}-${dd}`);
  }, []);

  // Monitor Cmd+Enter keyboard shortcut for rapid list entry
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmitForm();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [title, details, priority, deadline, timeSlot, project]);

  const handleSubmitForm = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!title.trim()) {
      setErrorMessage("Please provide an action title.");
      return;
    }

    setErrorMessage(null);
    
    // Request notification permission if not asked yet
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    
    onAddTask({
      title: title.trim().toUpperCase(),
      details: details.trim(),
      priority,
      deadline,
      timeSlot,
      project,
    });
  };

  const handleCancelDraft = () => {
    onCancel();
  };

  const handleAddCustomTag = () => {
    const cleanTag = customTagInput.trim();
    if (cleanTag) {
      if (!availableTags.includes(cleanTag)) {
        setAvailableTags([...availableTags, cleanTag]);
      }
      setProject(cleanTag);
      setCustomTagInput("");
      setShowCustomTagField(false);
    }
  };

  return (
    <div className="w-full pb-32 animate-fade-in text-left">
      {/* Header Bar */}
      <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handleCancelDraft}
            aria-label="Cancel and exit"
            className="p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-slate-700 text-2xl font-bold">close</span>
          </button>
          <span className="font-headline text-base font-bold text-slate-800 uppercase tracking-tight">Nudge</span>
        </div>
        <button
          onClick={handleCancelDraft}
          className="text-slate-500 hover:text-slate-800 hover:underline font-mono text-xs uppercase tracking-wider cursor-pointer font-bold"
        >
          Cancel Draft
        </button>
      </div>

      <form onSubmit={handleSubmitForm} className="space-y-6 max-w-2xl mx-auto">
        {/* Header Text */}
        <div className="space-y-1">
          <h2 className="font-headline text-xl sm:text-2xl font-black text-slate-800 uppercase tracking-tight">
            New Task
          </h2>
        </div>

        {errorMessage && (
          <div className="bg-zinc-100 border border-zinc-200 text-zinc-900 p-3.5 rounded-xl text-xs font-mono flex items-center gap-2">
            <span className="material-symbols-outlined text-zinc-700">warning</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Action Title */}
        <div className="space-y-1.5">
          <label className="block font-mono text-[10px] uppercase tracking-widest text-slate-400 font-bold" htmlFor="task-title">
            Action Item Title
          </label>
          <input
            id="task-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Type your objective..."
            className="w-full bg-white border border-slate-200 rounded-xl p-4 font-headline text-base sm:text-lg text-slate-800 placeholder:text-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black shadow-sm transition-all uppercase font-semibold"
          />
        </div>

        {/* Details Paragraph */}
        <div className="space-y-1.5">
          <label className="block font-mono text-[10px] uppercase tracking-widest text-slate-400 font-bold" htmlFor="task-desc">
            Specific instructions / Context
          </label>
          <textarea
            id="task-desc"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Add context or notes relating to this action..."
            rows={4}
            className="w-full bg-white border border-slate-200 rounded-xl p-4 font-body text-sm sm:text-base text-slate-600 placeholder:text-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black shadow-sm transition-all resize-none"
          />
        </div>

        {/* Interactivity Grid Block (Bento style) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Priority switcher block */}
          <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm flex flex-col justify-between min-h-[130px]">
            <label className="font-mono text-[10px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-slate-400 font-bold">priority_high</span> 
              <span>Priority Level</span>
            </label>
            <div className="flex w-full bg-slate-50 border border-slate-200 p-1 rounded-lg h-11 mt-3">
              <button
                type="button"
                onClick={() => setPriority("low")}
                className={`flex-1 flex items-center justify-center font-mono text-[11px] uppercase font-bold transition-all rounded-md cursor-pointer ${
                  priority === "low" ? "bg-white text-slate-700 shadow-sm border border-slate-200" : "text-slate-550 hover:bg-slate-200/50"
                }`}
              >
                Low
              </button>
              <button
                type="button"
                onClick={() => setPriority("medium")}
                className={`flex-1 flex items-center justify-center font-mono text-[11px] uppercase font-bold transition-all rounded-md cursor-pointer ${
                  priority === "medium" ? "bg-white text-slate-700 shadow-sm border border-slate-200" : "text-slate-550 hover:bg-slate-200/50"
                }`}
              >
                Med
              </button>
              <button
                type="button"
                onClick={() => setPriority("high")}
                className={`flex-1 flex items-center justify-center font-mono text-[11px] uppercase font-bold transition-all rounded-md cursor-pointer ${
                  priority === "high" ? "bg-black text-white shadow-sm border border-black" : "text-slate-550 hover:bg-slate-200/50"
                }`}
              >
                High
              </button>
            </div>
          </div>

          {/* Calendar deadline date picker block */}
          <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm flex flex-col justify-between min-h-[130px]">
            <label className="font-mono text-[10px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-slate-400 font-bold">calendar_today</span> 
              <span>Deadline</span>
            </label>
            <div className="mt-3 space-y-2 flex flex-col justify-between flex-1">
              <div className="flex w-full gap-1 items-center bg-slate-50 border border-slate-200 rounded-lg p-1">
                <input
                  type="text"
                  value={naturalDeadline}
                  onChange={(e) => setNaturalDeadline(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleParseDeadline();
                    }
                  }}
                  placeholder="e.g. next Friday at 3pm, or 'Write Q3 report'"
                  className="bg-transparent text-slate-800 font-sans text-base sm:text-xs w-full px-2 focus:outline-none placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={handleParseDeadline}
                  disabled={isParsingDeadline || !naturalDeadline.trim()}
                  className="bg-black text-white p-1 rounded-md hover:bg-zinc-800 disabled:opacity-50 transition flex-shrink-0"
                  title="Estimate with AI"
                >
                  {isParsingDeadline ? (
                    <span className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full block m-0.5"></span>
                  ) : (
                    <span className="material-symbols-outlined text-[16px] block">auto_awesome</span>
                  )}
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <span className="font-mono text-[9px] text-slate-400 uppercase font-bold flex-shrink-0">Exact:</span>
                <input
                  type="date"
                  required
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="bg-transparent text-slate-700 p-1 font-mono text-base sm:text-xs w-full focus:outline-none uppercase cursor-pointer h-7 text-right"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Recommended time slot selector (Horizontal Slider card) */}
        <div className="space-y-1.5 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <label className="block font-mono text-[10px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-slate-400 font-bold">schedule</span> 
            <span>Recommended Time Slot</span>
          </label>
          <div className="flex flex-wrap gap-2 py-1 mt-2">
            {[
              { label: "Morning", value: "09:00" },
              { label: "Afternoon", value: "14:30" },
              { label: "Evening", value: "18:00" },
            ].map((slot) => (
              <button
                key={slot.value}
                type="button"
                onClick={() => setTimeSlot(slot.value)}
                className={`px-4 py-2 border transition-all active:scale-95 cursor-pointer rounded-lg text-left min-w-[100px] shadow-sm ${
                  timeSlot === slot.value
                    ? "bg-black border-black text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className={`block font-mono text-[8px] uppercase ${timeSlot === slot.value ? "text-zinc-300" : "text-slate-400"}`}>
                  {slot.label}
                </span>
                <span className="font-headline text-base font-bold">{slot.value}</span>
              </button>
            ))}

            <div className="flex gap-2 border border-slate-250 p-1.5 rounded-lg items-center bg-slate-50 min-w-[150px] shadow-inner font-sans">
              <span className="font-mono text-[9px] text-slate-450 uppercase pl-1 font-bold">Custom:</span>
              <input
                type="time"
                value={timeSlot}
                onChange={(e) => setTimeSlot(e.target.value)}
                className="bg-transparent text-slate-700 border-none p-0.5 font-mono text-base sm:text-xs uppercase focus:ring-0 focus:outline-none w-full cursor-pointer text-center"
              />
            </div>
          </div>
        </div>

        {/* Project category selection rows */}
        <div className="space-y-1.5 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <label className="block font-mono text-[10px] uppercase tracking-widest text-slate-400 font-bold">
            Project Category
          </label>
          <div className="flex flex-wrap gap-1.5 items-center mt-2">
            {availableTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setProject(tag)}
                className={`px-3 py-1.5 border font-mono text-[10px] uppercase tracking-wider transition-colors cursor-pointer rounded-lg ${
                  project === tag
                    ? "bg-slate-800 border-slate-800 text-white font-bold"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm"
                }`}
              >
                {tag}
              </button>
            ))}

            {showCustomTagField ? (
              <div className="flex border border-slate-220 rounded-lg items-center bg-white px-1 py-0.5 shadow-sm">
                <input
                  type="text"
                  placeholder="New..."
                  maxLength={16}
                  value={customTagInput}
                  onChange={(e) => setCustomTagInput(e.target.value)}
                  className="bg-transparent text-slate-700 text-base sm:text-xs font-mono uppercase px-1.5 py-0.5 outline-none border-none focus:ring-0 max-w-[80px]"
                />
                <button
                  type="button"
                  onClick={handleAddCustomTag}
                  className="bg-black text-white px-2 py-0.5 font-mono text-[10px] uppercase font-bold rounded hover:bg-zinc-800"
                >
                  OK
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCustomTagField(true)}
                className="px-3 py-1.5 border border-dashed border-slate-350 text-slate-400 hover:bg-slate-100 font-mono text-[10px] uppercase tracking-wider cursor-pointer rounded-lg"
              >
                + Add Category
              </button>
            )}
          </div>
        </div>

        {/* Submit Actions Button block container */}
        <div className="pt-4 space-y-3">
          <button
            type="submit"
            className="w-full bg-black text-white font-headline text-base py-3.5 font-bold uppercase rounded-xl shadow-lg hover:bg-zinc-900 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer border border-black/10"
          >
            <span className="material-symbols-outlined text-[20px] font-bold">check_circle</span>
            <span>Add Action Task</span>
          </button>
        </div>
      </form>
    </div>
  );
}
