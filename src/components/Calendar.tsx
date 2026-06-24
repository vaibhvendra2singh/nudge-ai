import React, { useState } from "react";
import { Task } from "../types";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from "date-fns";

interface CalendarProps {
  tasks: Task[];
  onSelectTask: (id: string) => void;
}

export default function Calendar({ tasks, onSelectTask }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  });

  const startDay = startOfMonth(currentDate).getDay(); // 0 for Sunday, 6 for Saturday
  const emptyDays = Array.from({ length: startDay }, (_, i) => i);

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  return (
    <div className="w-full bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-headline text-xl font-bold uppercase tracking-tight text-slate-800">
          {format(currentDate, "MMMM yyyy")}
        </h2>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
            <span className="material-symbols-outlined text-sm">chevron_left</span>
          </button>
          <button onClick={nextMonth} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
            <span className="material-symbols-outlined text-sm">chevron_right</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
          <div key={day} className="text-center font-mono text-[10px] font-bold text-slate-400 uppercase py-2">
            {day}
          </div>
        ))}
        {emptyDays.map((_, index) => (
          <div key={`empty-${index}`} className="min-h-[80px]" />
        ))}
        {daysInMonth.map(day => {
          const dayTasks = tasks.filter(task => {
            const taskDate = new Date(task.deadline);
            return !isNaN(taskDate.getTime()) && isSameDay(taskDate, day);
          });
          return (
            <div key={day.toString()} className="min-h-[80px] border border-slate-100 rounded-lg p-2 hover:bg-slate-50 transition-colors">
              <span className="font-mono text-xs font-bold text-slate-700">{format(day, "d")}</span>
              <div className="mt-1 space-y-1">
                {dayTasks.map(task => (
                  <div 
                    key={task.id} 
                    onClick={() => onSelectTask(task.id)}
                    className="text-[9px] truncate bg-slate-200 px-1.5 py-0.5 rounded cursor-pointer hover:bg-black hover:text-white transition-all"
                  >
                    {task.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
