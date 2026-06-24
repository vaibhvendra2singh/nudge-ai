export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  details: string;
  priority: 'low' | 'medium' | 'high';
  deadline: string; // YYYY-MM-DD template
  completed: boolean;
  archived?: boolean;
  project: string; // "Work", "Personal", "Marketing Campaign", etc.
  timeSlot?: string; // "09:00", "14:30", "18:00", "Custom"
  subtasks: SubTask[];
  aiNudge?: string | null;
  aiBreakdownGenerated?: boolean;
  completedAt?: string; // ISO date or YYYY-MM-DD
}
