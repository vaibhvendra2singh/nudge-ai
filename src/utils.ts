import { Task } from "./types";

/**
 * Calculates human readable remaining time and maps the task to an urgency category.
 * - 'urgent': due today/less than 24 hours (<= 24 hours remaining)
 * - 'soon': due in 1 to 4 days
 * - 'future': due in 5 or more days
 */
export function getTaskUrgencyDetails(task: Task, referenceDateStr?: string | null) {
  const referenceDate = referenceDateStr ? new Date(referenceDateStr) : new Date();
  
  // Set deadline date time to the selected recommended time or default 17:00 (5:00 PM) today
  let deadlineTimeStr = "17:00";
  if (task && task.timeSlot) {
    deadlineTimeStr = task.timeSlot;
  }
  
  if (!task || !task.deadline || typeof task.deadline !== "string") {
    return {
      timeLabel: "No Deadline",
      category: "future" as const,
      hoursLeft: 0,
      isOverdue: false,
    };
  }
  
  const parts = task.deadline.split("-");
  if (parts.length < 3) {
    return {
      timeLabel: "Invalid Deadline",
      category: "future" as const,
      hoursLeft: 0,
      isOverdue: false,
    };
  }
  
  // Parse task deadline which is template 'YYYY-MM-DD'
  const [year, month, day] = parts.map(Number);
  let parsedHour = 17;
  let parsedMinute = 0;
  if (deadlineTimeStr) {
    const timeParts = deadlineTimeStr.split(":");
    if (timeParts.length >= 2) {
      parsedHour = Number(timeParts[0]);
      parsedMinute = Number(timeParts[1]);
    }
  }
  
  const deadlineDate = new Date(year, month - 1, day, parsedHour, parsedMinute, 0);
  
  const diffMs = deadlineDate.getTime() - referenceDate.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  
  let timeLabel = "";
  let category: "urgent" | "soon" | "future" = "future";
  let hoursLeft = Math.max(0, Math.floor(diffHours));
  let isOverdue = diffMs < 0;

  if (isOverdue) {
    timeLabel = "Overdue";
    category = "urgent";
  } else if (diffHours <= 2) {
    category = "urgent";
    const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    timeLabel = `${minutes} min${minutes > 1 ? "s" : ""} left`;
  } else if (diffHours <= 24) {
    category = "urgent";
    const hours = Math.max(1, Math.floor(diffHours));
    timeLabel = `${hours} hour${hours > 1 ? "s" : ""} left`;
  } else if (diffHours <= 72) {
    category = "soon";
    const days = Math.floor(diffHours / 24);
    const hrs = Math.floor(diffHours % 24);
    timeLabel = `${days}d ${hrs}h left`;
  } else {
    category = "future";
    const days = Math.ceil(diffHours / 24);
    timeLabel = `${days} day${days > 1 ? "s" : ""} left`;
  }

  return {
    timeLabel,
    category,
    hoursLeft,
    isOverdue,
  };
}

/**
 * Generates and triggers download of a standardized .ics calendar event file
 * for Google Calendar, Apple Calendar, Outlook, etc.
 */
export function downloadICSFile(task: {
  title: string;
  details?: string;
  deadline: string;
  timeSlot?: string;
  project?: string;
}) {
  const dateStr = task.deadline; // e.g., "2026-06-23"
  const timeStr = task.timeSlot || "17:00"; // e.g., "17:00"

  // Parse date and time safely
  let dateObj = new Date();
  const dateParts = dateStr.split("-");
  if (dateParts.length === 3) {
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);

    const timeParts = timeStr.split(":");
    const hours = timeParts.length >= 1 ? parseInt(timeParts[0], 10) : 17;
    const minutes = timeParts.length >= 2 ? parseInt(timeParts[1], 10) : 0;

    dateObj = new Date(year, month, day, hours, minutes);
  } else {
    const parsed = Date.parse(dateStr);
    if (!isNaN(parsed)) {
      dateObj = new Date(parsed);
    }
  }

  const pad = (num: number) => String(num).padStart(2, "0");

  const formatDateICS = (date: Date) => {
    return (
      date.getUTCFullYear() +
      pad(date.getUTCMonth() + 1) +
      pad(date.getUTCDate()) +
      "T" +
      pad(date.getUTCHours()) +
      pad(date.getUTCMinutes()) +
      pad(date.getUTCSeconds()) +
      "Z"
    );
  };

  const dtStamp = formatDateICS(new Date());
  const dtStart = formatDateICS(dateObj);

  // End time is 30 mins after start default
  const endObj = new Date(dateObj.getTime() + 30 * 60 * 1000);
  const dtEnd = formatDateICS(endObj);

  // Escape special chars for ICS format
  const escapeICS = (str: string) => {
    return str
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  };

  const titleEscaped = escapeICS(task.title);
  const detailsEscaped = escapeICS(
    task.details || "Refine this task objective and finish outstanding steps."
  );
  const projectEscaped = task.project ? escapeICS(task.project) : "Nudge Task";

  const uid = `nudge-${Date.now()}-${Math.random().toString(36).substring(2, 11)}@nudgeflow`;

  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NudgeFlow//Nudge Task Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${projectEscaped ? `[${projectEscaped}] ` : ""}${titleEscaped}`,
    `DESCRIPTION:${detailsEscaped}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const icsContent = icsLines.join("\r\n");
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;

  const sanitizedTitle = task.title.replace(/[^a-z0-9]/gi, "_").toLowerCase().slice(0, 30);
  link.download = `nudge_task_${sanitizedTitle || "event"}.ics`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Synthesizes a subtle, premium ambient "nudge" or "focus tone" chime using the browser's Web Audio API.
 * This does not rely on static audio files and works beautifully in modern web runtimes.
 */
export function playNudgeChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    // Warm, organic dual-frequency chime
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc1.type = "sine";
    // Warm perfect fifth: C5 (523.25 Hz)
    osc1.frequency.setValueAtTime(523.25, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.15); // Slide to G5
    
    osc2.type = "sine";
    // Supporting third: E5 (659.25 Hz)
    osc2.frequency.setValueAtTime(659.25, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.15); // Slide to C6
    
    gainNode.gain.setValueAtTime(0.001, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.05); // Fade in slightly
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2); // Exp decay
    
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc1.start();
    osc2.start();
    
    osc1.stop(ctx.currentTime + 1.2);
    osc2.stop(ctx.currentTime + 1.2);
  } catch (err) {
    console.warn("AudioContext playback failed or block by browser autoplay limits:", err);
  }
}


