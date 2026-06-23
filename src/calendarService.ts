export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
}

export async function fetchUpcomingEvents(accessToken: string, daysAhead = 7): Promise<CalendarEvent[]> {
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
  
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
  
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  
  if (!res.ok) {
    throw new Error(`Google Calendar API returned status ${res.status}`);
  }
  
  const data = await res.json();
  return (data.items || []) as CalendarEvent[];
}

export interface CalendarConflict {
  event: CalendarEvent;
  type: "direct" | "nearby";
}

/**
 * Checks if a task deadline conflicts with any Google Calendar events.
 */
export function checkDeadlineConflicts(
  deadlineDateStr: string,
  deadlineTimeStr: string,
  events: CalendarEvent[]
): CalendarConflict[] {
  if (!deadlineDateStr) return [];
  
  // Parse target date/time
  const timePart = deadlineTimeStr || "12:00";
  const targetDate = new Date(`${deadlineDateStr}T${timePart}`);
  if (isNaN(targetDate.getTime())) return [];
  
  const conflicts: CalendarConflict[] = [];
  
  for (const event of events) {
    const startStr = event.start.dateTime || event.start.date;
    const endStr = event.end.dateTime || event.end.date;
    if (!startStr || !endStr) continue;
    
    const start = new Date(startStr);
    const end = new Date(endStr);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
    
    const isAllDay = !event.start.dateTime;
    if (isAllDay) {
      const targetDayStr = deadlineDateStr; // e.g. "2026-06-25"
      const eventStartDayStr = startStr.split("T")[0];
      if (targetDayStr === eventStartDayStr) {
        conflicts.push({ event, type: "direct" });
      }
    } else {
      // Direct conflict: target time falls inside the event
      if (targetDate >= start && targetDate <= end) {
        conflicts.push({ event, type: "direct" });
      } else {
        // Nearby conflict: target is within 1.5 hours of the event
        const gapMs = 90 * 60 * 1000;
        const targetMs = targetDate.getTime();
        const startMs = start.getTime();
        const endMs = end.getTime();
        
        if (
          (targetMs >= startMs - gapMs && targetMs < startMs) ||
          (targetMs > endMs && targetMs <= endMs + gapMs)
        ) {
          conflicts.push({ event, type: "nearby" });
        }
      }
    }
  }
  
  return conflicts;
}
