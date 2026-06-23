import React, { useState, useEffect } from "react";
import { Task } from "../types";

interface AddTaskProps {
  onAddTask: (newTask: Omit<Task, "id" | "completed" | "subtasks">) => void;
  onCancel: () => void;
}

export default function AddTask({ onAddTask, onCancel }: AddTaskProps) {
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

  // AI Voice task draft state
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [isProcessingSpeech, setIsProcessingSpeech] = useState(false);
  const [recognitionObj, setRecognitionObj] = useState<any>(null);
  const [speechSuccessMessage, setSpeechSuccessMessage] = useState<string | null>(null);

  // Initialize SpeechRecognition safely on mount
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onresult = (event: any) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setTranscript((prev) => {
            const separator = prev && !prev.endsWith(" ") ? " " : "";
            return prev + separator + finalTranscript;
          });
        }
      };

      rec.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === "not-allowed") {
          setSpeechError("Microphone access is not allowed. Please allow microphone permissions in your browser.");
        } else {
          setSpeechError(`Microphone error: ${event.error}`);
        }
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      setRecognitionObj(rec);
    }
  }, []);

  const startListening = () => {
    if (!recognitionObj) {
      setSpeechError("Speech recognition is not supported in this browser. Please try Chrome, Edge or Safari.");
      return;
    }
    setSpeechError(null);
    setSpeechSuccessMessage(null);
    setTranscript("");
    try {
      recognitionObj.start();
      setIsListening(true);
    } catch (err) {
      console.error(err);
      setSpeechError("Failed to initiate microphone stream recording.");
    }
  };

  const stopListening = () => {
    if (recognitionObj) {
      try {
        recognitionObj.stop();
      } catch (err) {
        console.error(err);
      }
    }
    setIsListening(false);
  };

  const handleSpeechExtractTaskDetails = async () => {
    if (!transcript.trim()) {
      setSpeechError("Speak or type something in the draft before triggering AI extraction.");
      return;
    }

    // Stop listening if mic is actively recording
    if (isListening) {
      stopListening();
    }

    setIsProcessingSpeech(true);
    setSpeechError(null);
    setSpeechSuccessMessage(null);

    try {
      const response = await fetch("/api/gemini/extract-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speechText: transcript,
          currentDate: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error("Server extraction request failed.");
      }

      const extracted = await response.json();
      if (extracted) {
        if (extracted.title) setTitle(extracted.title.toUpperCase());
        if (extracted.details) setDetails(extracted.details);
        if (extracted.priority) setPriority(extracted.priority);
        if (extracted.deadline) setDeadline(extracted.deadline);
        if (extracted.timeSlot) setTimeSlot(extracted.timeSlot);
        if (extracted.project) {
          setProject(extracted.project);
          if (!availableTags.includes(extracted.project)) {
            setAvailableTags((prev) => [...prev, extracted.project]);
          }
        }
        setSpeechSuccessMessage("Magic AI Extraction Complete! Review your active form options below.");
        setTranscript(""); // reset draft text once consumed
      }
    } catch (err: any) {
      console.error(err);
      setSpeechError("AI couldn't map the instructions automatically. Standard typing fell back instead.");
    } finally {
      setIsProcessingSpeech(false);
    }
  };

  // Set default deadline date string to Today or load saved draft on mount
  useEffect(() => {
    let savedParsed: any = null;
    const savedDraft = localStorage.getItem("nudge_add_task_draft");
    if (savedDraft) {
      try {
        savedParsed = JSON.parse(savedDraft);
      } catch (e) {
        console.error("Failed to parse task draft:", e);
      }
    }

    if (savedParsed) {
      if (savedParsed.title) setTitle(savedParsed.title);
      if (savedParsed.details) setDetails(savedParsed.details);
      if (savedParsed.priority) setPriority(savedParsed.priority);
      if (savedParsed.deadline) {
        setDeadline(savedParsed.deadline);
      } else {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        setDeadline(`${yyyy}-${mm}-${dd}`);
      }
      if (savedParsed.timeSlot) setTimeSlot(savedParsed.timeSlot);
      if (savedParsed.project) setProject(savedParsed.project);
    } else {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      setDeadline(`${yyyy}-${mm}-${dd}`);
    }
  }, []);

  // Save draft state to localStorage on any change (only after initial mount/render is processed)
  useEffect(() => {
    if (title || details || project !== "Work" || priority !== "medium") {
      const draft = { title, details, priority, deadline, timeSlot, project };
      localStorage.setItem("nudge_add_task_draft", JSON.stringify(draft));
    }
  }, [title, details, priority, deadline, timeSlot, project]);

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
    localStorage.removeItem("nudge_add_task_draft");
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
    localStorage.removeItem("nudge_add_task_draft");
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
            New Task Draft
          </h2>
          <p className="text-slate-500 text-xs font-mono uppercase">
            Capture your momentum. Set the pace.
          </p>
        </div>

        {/* Voice Extraction Bento Block */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-slate-800 font-bold">settings_voice</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-700 font-bold">
                Voice Assistant Input
              </span>
            </div>
            {isListening ? (
              <span className="flex items-center gap-1.5 px-2 py-1 bg-red-50 text-red-600 rounded-full font-mono text-[9px] uppercase tracking-wider font-bold border border-red-150 animate-pulse">
                <span className="h-1.5 w-1.5 bg-red-650 rounded-full"></span>
                <span>Active Recording</span>
              </span>
            ) : (
              <span className="px-2 py-1 bg-slate-200/50 text-slate-500 rounded-lg font-mono text-[9px] uppercase tracking-wider font-bold">
                Standby Mode
              </span>
            )}
          </div>

          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={isListening ? stopListening : startListening}
              className={`flex-shrink-0 h-14 w-14 rounded-full flex items-center justify-center cursor-pointer transition-all active:scale-95 shadow-md ${
                isListening
                  ? "bg-red-500 hover:bg-red-650 text-white animate-pulse shadow-red-100"
                  : "bg-black hover:bg-zinc-800 text-white shadow-zinc-200"
              }`}
              title={isListening ? "Stop listening" : "Start speaking details"}
            >
              <span className="material-symbols-outlined text-[26px]">
                {isListening ? "mic_off" : "mic"}
              </span>
            </button>

            <div className="flex-1 space-y-2">
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Click microphone, details are processed by speech recognition. (e.g., <span className="italic text-slate-705">"Remind me to call the dentist by Friday 5pm"</span> or <span className="italic text-slate-705">"Review project guidelines by tomorrow afternoon high priority"</span>).
              </p>

              {/* Editable Transcription preview */}
              {(transcript || isListening) && (
                <div className="space-y-1.5 mt-2 animate-fade-in text-left">
                  <label className="block font-mono text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                    Captured Natural Transcript
                  </label>
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder={isListening ? "Listening... start speaking naturally..." : "Edit transcription text here if needed..."}
                    rows={2}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-700 font-sans focus:outline-none focus:ring-1 focus:ring-black min-h-[44px]"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Feedback logs */}
          {speechError && (
            <div className="text-[10px] font-mono text-zinc-650 bg-zinc-50 p-2.5 rounded-lg border border-zinc-200 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="material-symbols-outlined text-[13px] text-zinc-650 font-bold flex-shrink-0">warning</span>
                <span className="truncate">{speechError}</span>
              </div>
              {transcript && (
                <button
                  type="button"
                  onClick={handleSpeechExtractTaskDetails}
                  disabled={isProcessingSpeech}
                  className="px-2 py-1 bg-black text-white hover:bg-zinc-800 rounded font-mono text-[9px] uppercase tracking-wider font-bold cursor-pointer transition-all flex items-center gap-0.5 active:scale-95 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[12px]">refresh</span>
                  <span>Retry Extraction</span>
                </button>
              )}
            </div>
          )}

          {speechSuccessMessage && (
            <div className="text-[10px] font-mono text-emerald-800 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 flex items-center gap-1.5 animate-bounce">
              <span className="material-symbols-outlined text-[13px] text-emerald-700 font-bold">task_alt</span>
              <span>{speechSuccessMessage}</span>
            </div>
          )}

          {/* Action trigger button */}
          {transcript && (
            <div className="flex justify-end pt-1 animate-fade-in">
              <button
                type="button"
                onClick={handleSpeechExtractTaskDetails}
                disabled={isProcessingSpeech}
                className="flex items-center gap-1.5 px-4.5 py-2 bg-slate-900 hover:bg-black text-white font-mono text-[10px] uppercase font-bold tracking-wider rounded-lg shadow-xs hover:shadow-xs active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isProcessingSpeech ? (
                  <>
                    <span className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full"></span>
                    <span>Analyzing structured details...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                    <span>Intelligently Extract with Gemini</span>
                  </>
                )}
              </button>
            </div>
          )}
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
              <span>Deadline Date</span>
            </label>
            <div className="mt-3">
              <input
                type="date"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="bg-white text-slate-700 border border-slate-200 p-2 font-mono text-xs rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black uppercase cursor-pointer h-10"
              />
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

            <div className="flex gap-2 border border-slate-250 p-1.5 rounded-lg items-center bg-slate-50 min-w-[150px] shadow-inner">
              <span className="font-mono text-[9px] text-slate-450 uppercase pl-1 font-bold">Custom:</span>
              <input
                type="time"
                value={timeSlot}
                onChange={(e) => setTimeSlot(e.target.value)}
                className="bg-transparent text-slate-700 border-none p-0.5 font-mono text-xs uppercase focus:ring-0 focus:outline-none w-full cursor-pointer text-center"
              />
            </div>
          </div>
        </div>

        {/* Project category selection tag rows */}
        <div className="space-y-1.5 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <label className="block font-mono text-[10px] uppercase tracking-widest text-slate-400 font-bold">
            Project Category Tag
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
                  className="bg-transparent text-slate-700 text-xs font-mono uppercase px-1.5 py-0.5 outline-none border-none focus:ring-0 max-w-[80px]"
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
                + Add Tag
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
          
          <p className="text-center text-[10px] text-slate-400 font-mono uppercase tracking-widest">
            Press <kbd className="bg-white px-1.5 py-0.5 border border-slate-200 shadow-sm rounded ml-1 text-slate-550">Cmd</kbd> + <kbd className="bg-white px-1.5 py-0.5 border border-slate-200 shadow-sm rounded text-slate-550">Enter</kbd> to quick-save immediately
          </p>
        </div>
      </form>
    </div>
  );
}
