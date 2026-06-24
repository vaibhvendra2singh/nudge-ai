import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize the Google Gen AI client model
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set. Please add it in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Helper to clean JSON string returned from the AI response
function cleanAndParseJSON(text: string): any {
  if (!text) return {};
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (nestedErr) {
        // failed to parse
      }
    }
    throw err;
  }
}

// Local Fallback Generator for subtask breakdowns
function getLocalFallbackBreakdown(title: string, details: string, project: string): string[] {
  const t = (title || "").toUpperCase();
  const d = (details || "").toUpperCase();
  
  if (t.includes("EMAIL") || t.includes("PROPOSAL") || t.includes("MAIL") || d.includes("MAIL") || d.includes("WRITE")) {
    return [
      "Review target audience key objectives",
      "Draft concise outline of core content",
      "Format clear bullet-point action items",
      "Verify spelling, layout, and links before sending"
    ];
  }
  
  if (t.includes("RUN") || t.includes("FITNESS") || t.includes("WORKOUT") || t.includes("HEALTH") || t.includes("DIET") || t.includes("GYM")) {
    return [
      "Hydrate and prepare standard training gear",
      "Perform a quick 5-minute dynamic warmup",
      "Complete the core planned activity blocks",
      "Conduct essential post-workout cooldown stretches"
    ];
  }
  
  if (t.includes("DESIGN") || t.includes("STYLE") || t.includes("FIGMA") || t.includes("PALETTE") || t.includes("UI") || t.includes("GRAPHIC")) {
    return [
      "Isolate current styling and color patterns",
      "Sketch component wireframes and screen flow",
      "Implement uniform layouts with Tailwind utility tags",
      "Refine contrast, margins, and typography scale"
    ];
  }
  
  if (t.includes("CODE") || t.includes("API") || t.includes("DEVELOP") || t.includes("BUILD") || t.includes("REFACTOR") || t.includes("BUG") || t.includes("FIX")) {
    return [
      "Verify requirements and write interface models",
      "Build functional endpoints and state controllers",
      "Perform thorough console diagnostic testing",
      "Deploy code incrementally and check performance"
    ];
  }
  
  if (t.includes("PLAN") || t.includes("STRATEGY") || t.includes("REVIEW") || t.includes("SYNC") || t.includes("MEET") || t.includes("PREP")) {
    return [
      "Gather relevant metrics and performance figures",
      "Draft concise bullet points of agenda items",
      "Conduct check-in with primary stake-holders",
      "Record concrete next-actions back to system"
    ];
  }
  
  if (t.includes("CLEAN") || t.includes("HOME") || t.includes("ROOM") || t.includes("ORGANIZ") || t.includes("BUY") || t.includes("SHOP")) {
    return [
      "Declutter focal areas and gather tools needed",
      "Execute primary organization and storage flow",
      "Sanitize surfaces or purchase required list items",
      "Inspect outcome and store tools correctly"
    ];
  }

  // General high fidelity robust fallback
  return [
    `Establish specific desired outcome for "${title}"`,
    "Isolate first actionable 10-minute micro-step",
    "Eliminate active notification cues for tight focus",
    "Execute micro-step and review work quality"
  ];
}

// Local Fallback Generator for motivational nudges showing direct human tone without industry jargon
function getLocalFallbackNudge(title: string, priority: string, deadline: string | null | undefined): string {
  const targetStr = deadline ? `by ${deadline}` : "soon";
  const options = [
    `Completing "${title}" now will clear a major item from your plate and let you focus on other things without worry.`,
    `Starting on "${title}" now is the best way to handle this without having to rush when it is due ${targetStr}.`,
    `Let's get "${title}" out of the way today. Crossing off the first small step is where momentum starts.`,
    `Taking care of "${title}" today keeps everything else running smoothly. Let's make this the next priority.`
  ];
  const charSum = (title || "").length;
  return options[charSum % options.length];
}

// Call Gemini generateContent API with robust retry mechanism and backup model fallbacks
async function callGeminiWithFallback(contents: string | any[], config: any): Promise<any> {
  const ai = getAiClient();
  
  // Try 1: Main 'gemini-3.5-flash' model
  try {
    console.log("Calling Gemini using 'gemini-3.5-flash'...");
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config
    });
    return response;
  } catch (error: any) {
    console.warn("Primary model 'gemini-3.5-flash' is experiencing issues or high load:", error?.message || error);
    
    // Check if the error looks like something we can retry with gemini-3.1-flash-lite
    console.log("Attempting fallback call to 'gemini-3.1-flash-lite'...");
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents,
        config
      });
      console.log("Success with 'gemini-3.1-flash-lite' fallback!");
      return response;
    } catch (fallbackError: any) {
      console.error("Fallback model 'gemini-3.1-flash-lite' also failed:", fallbackError?.message || fallbackError);
      // Return null, indicating caller must use local fallback
      return null;
    }
  }
}

// 1. API Route: AI subtask breakdown
app.post("/api/breakdown", async (req: express.Request, res: express.Response): Promise<void> => {
  const { title, details, project, priority, deadline } = req.body;
  if (!title) {
    res.status(400).json({ error: "Task title is required." });
    return;
  }

  try {
    const prompt = `Break down the following task into 3 to 5 concrete, realistic subtasks specific to this exact task.
Project context: ${project || "General"}
Priority: ${priority || "medium"}
Task Title: ${title}
Details: ${details || "No details provided."}
Deadline: ${deadline || "Not specified."}

Return a list of strictly 3 to 5 clear, concrete, and highly actionable subtask titles. Keep them short and professional.`;

    const config = {
      systemInstruction: "You are an elite productivity executive. You excel at breaking down large tasks into 3 to 5 concrete, realistic, and highly actionable subtasks specific to this exact task. Address the specific goals of the task and use the deadline and details as context. Keep each subtask short (under 8 words).",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subtasks: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
            description: "List of 3 to 5 concrete, realistic actionable subtasks.",
          },
        },
        required: ["subtasks"],
      },
    };

    const response = await callGeminiWithFallback(prompt, config);
    
    if (response && response.text) {
      const data = cleanAndParseJSON(response.text);
      if (data && Array.isArray(data.subtasks) && data.subtasks.length > 0) {
        res.json({ subtasks: data.subtasks });
        return;
      }
    }
    
    // If we reach here, it means we didn't get a valid AI response, so use the smart local fallback generator!
    console.log("AI service unavailable. Using local fallback subtask generator for:", title);
    const fallbackList = getLocalFallbackBreakdown(title, details || "", project || "Work");
    res.json({ subtasks: fallbackList });
  } catch (error: any) {
    console.error("Unhandled error in /api/breakdown, using local generator:", error);
    const fallbackList = getLocalFallbackBreakdown(title, details || "", project || "Work");
    res.json({ subtasks: fallbackList });
  }
});

// 2. API Route: Intelligent "Urgent Nudge"
app.post("/api/nudge", async (req: express.Request, res: express.Response): Promise<void> => {
  const { title, details, priority, deadline, subtasks, hoursLeft, currentTime, otherUrgentTasksCount } = req.body;
  if (!title) {
    res.status(400).json({ error: "Task title is required." });
    return;
  }

  try {
    const subtaskStatus = subtasks && subtasks.length > 0 
      ? `Subtasks remaining:\n${subtasks.map((s: any) => `- [ ] ${s.title}`).join("\n")}`
      : "No subtasks structured yet.";

    let workloadContext = "";
    if (otherUrgentTasksCount !== undefined && otherUrgentTasksCount > 0) {
      workloadContext = `User Workload Context: The user has ${otherUrgentTasksCount} OTHER urgent tasks pending right now. Frame this as managing a heavy workload intelligently.`;
    }

    const prompt = `This task is highly urgent and due very soon! Provide an authentic, direct, motivational nudge/alert.
Task: ${title} (Priority: ${priority || "medium"})
Details: ${details || "No other details."}
Deadline: ${deadline || "Not specified."}
Time Left: ${hoursLeft ? `${hoursLeft} hours left` : "less than 24 hours left"}
Current Time of user: ${currentTime || "Unknown"}
${workloadContext}
${subtaskStatus}

Provide an authentic, zero-fluff, non-generic, high-agency 1-sentence reason why this matters right now and how to tackle it given their workload. Do not use generic clichés or corporate jargon.`;

    const config = {
      systemInstruction: "You are a sharp, direct human assistant. Give one clear, specific reason why this task matters right now, using the task's title, description, and deadline as context. Do NOT use generic business jargon (e.g., do NOT say 'high density block', 'checkout releases', 'synergic paradigms', etc.). Speak directly, concisely, and with high-agency human urgency. Limit the response to exactly 1 clear sentence.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          nudge: {
            type: Type.STRING,
            description: "A highly specific, custom 1-sentence motivator for this exact task.",
          },
        },
        required: ["nudge"],
      },
    };

    const response = await callGeminiWithFallback(prompt, config);
    
    if (response && response.text) {
      const data = cleanAndParseJSON(response.text);
      if (data && data.nudge) {
        res.json({ nudge: data.nudge });
        return;
      }
    }

    // fallback content
    console.log("AI service unavailable. Using local fallback nudge generator for:", title);
    const fallbackNudge = getLocalFallbackNudge(title, priority || "medium", deadline);
    res.json({ nudge: fallbackNudge });
  } catch (error: any) {
    console.error("Unhandled error in /api/nudge, using local generator:", error);
    const fallbackNudge = getLocalFallbackNudge(title, priority || "medium", deadline);
    res.json({ nudge: fallbackNudge });
  }
});

// 3. API Route: Dynamic highlighted agenda message for "Needs Action Now"
app.post("/api/needs-action-summary", async (req: express.Request, res: express.Response): Promise<void> => {
  const { tasks } = req.body;
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    res.json({ summary: "No immediate threats in your pipeline today. Keep maintaining momentum." });
    return;
  }

  try {
    const tasksListStr = tasks.map((t: any) => `- ${t.title}: ${t.details || "No details"} (Deadline: ${t.deadline || 'Today'}, Priority: ${t.priority || 'medium'})`).join("\n");
    const prompt = `Below are several highly urgent tasks due within 24 hours that currently have no completed checklist items.
Provide exactly ONE brief, highly direct, authentic, and high-agency human sentence summarizing what the user should immediately tackle next across these tasks, or why doing so right now matters. Make it specific to the goals of these tasks, avoid corporate boilerplate, and do NOT use any generic business jargon (like 'high density block', 'checkout releases', 'synergistic alignments', etc.).

Urgent tasks:
${tasksListStr}

Write exactly one sentence.`;

    const config = {
      systemInstruction: "You are a sharp, direct, other-centered human assistant. Give exactly 1 clear, specific reason why these urgent tasks matter right now or what the next action is, using the task details as context. Do NOT use fake, generic business jargon. Speak directly, concisely, and with human urgency. Limit response to exactly 1 clear sentence.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: "A highly specific, custom 1-sentence motivator summary.",
          },
        },
        required: ["summary"],
      },
    };

    const response = await callGeminiWithFallback(prompt, config);
    if (response && response.text) {
      const data = cleanAndParseJSON(response.text);
      if (data && data.summary) {
        res.json({ summary: data.summary });
        return;
      }
    }

    // Dynamic local fallback if AI fails
    const titles = tasks.map((t: any) => `"${t.title}"`).join(" and ");
    res.json({ summary: `Let's tackle ${titles} next to clear your major blockers for the day.` });
  } catch (error: any) {
    console.error("Unhandled error in /api/needs-action-summary, using fallback:", error);
    const titles = tasks.map((t: any) => `"${t.title}"`).join(" and ");
    res.json({ summary: `Let's tackle ${titles} next to clear your major blockers for the day.` });
  }
});

// 4. API Route: AI natural language speech task extraction
app.post("/api/gemini/extract-task", async (req: express.Request, res: express.Response): Promise<void> => {
  const { speechText, currentDate } = req.body;
  if (!speechText) {
    res.status(400).json({ error: "Missing speechText parameter." });
    return;
  }

  try {
    const prompt = `Translate this natural language speech transcription into a structured task.
Base any relative date/time calculation on the provided reference current date and time context: ${currentDate || new Date().toISOString()}.

Speech transcription: "${speechText}"

We need to fill the following task properties:
1. title: A short, active, capitalized task objective (e.g. "Call the dentist" instead of "remind me to call the dentist").
2. details: Any supplementary information or context spoken.
3. deadline: Specific target date in YYYY-MM-DD format (essential: if referencing relative expressions like "by friday" or "tomorrow", compute the exact date using the current date reference).
4. timeSlot: HH:MM format (e.g. "17:00" if spoken "5pm", default to "14:30" if unspecified).
5. priority: One of "low", "medium", "high".
6. project: One of "Work", "Personal", "Deep Work", "Marketing" or custom brief context tag.

Respond with valid JSON exactly fitting the schema.`;

    const config = {
      systemInstruction: "You are an intelligent scheduler assistant. Accurately extract task parameters from speech. Always resolve relative dates (like 'tomorrow', 'next week', 'Friday') into valid YYYY-MM-DD strings based on the given currentDate reference. Give concise responses.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Capitalized short actionable title." },
          details: { type: Type.STRING, description: "Clean context or additional instructions." },
          deadline: { type: Type.STRING, description: "YYYY-MM-DD date string." },
          timeSlot: { type: Type.STRING, description: "HH:MM format time slot." },
          priority: { type: Type.STRING, description: "Must be 'low', 'medium', or 'high'." },
          project: { type: Type.STRING, description: "The project tag name." }
        },
        required: ["title", "details", "deadline", "timeSlot", "priority", "project"]
      }
    };

    const response = await callGeminiWithFallback(prompt, config);
    if (response && response.text) {
      const data = cleanAndParseJSON(response.text);
      if (data && data.title) {
        res.json(data);
        return;
      }
    }

    // Fallback if AI fails or returns invalid structure
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    res.json({
      title: speechText.slice(0, 40).toUpperCase(),
      details: speechText,
      deadline: `${yyyy}-${mm}-${dd}`,
      timeSlot: "14:30",
      priority: "medium",
      project: "Work"
    });
  } catch (error: any) {
    console.error("Unhandled error in /api/gemini/extract-task, using basic fallback:", error);
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    res.json({
      title: speechText.slice(0, 40).toUpperCase(),
      details: speechText,
      deadline: `${yyyy}-${mm}-${dd}`,
      timeSlot: "14:30",
      priority: "medium",
      project: "Work"
    });
  }
});

app.post("/api/gemini/parse-deadline", async (req: express.Request, res: express.Response): Promise<void> => {
  const { text, currentDate } = req.body;
  if (!text) {
    res.status(400).json({ error: "No text provided" });
    return;
  }
  
  try {
    const prompt = `You are a scheduling AI assistant.
Current date reference: ${currentDate || new Date().toISOString()}

Analyze this task description: "${text}"

Your goal is to extract OR suggest a realistic deadline.
1. If the user explicitly mentions a deadline (e.g. "by Friday", "tomorrow at 3pm"), parse that exact date and time.
2. If the user does NOT mention a deadline (e.g. "Write the Q3 report", "Buy groceries"), estimate a realistic deadline based on how long the task typically takes, and suggest a date/time (e.g., today at 17:00 for simple tasks, or a few days later for complex ones).
If time is not specified, default to 17:00.

Return a JSON object with 'deadline' (YYYY-MM-DD format) and 'timeSlot' (HH:MM format in 24-hour time).`;

    const config = {
      systemInstruction: "You strictly output JSON dates and times.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          deadline: { type: Type.STRING, description: "YYYY-MM-DD format" },
          timeSlot: { type: Type.STRING, description: "HH:MM format" }
        },
        required: ["deadline", "timeSlot"]
      }
    };

    const response = await callGeminiWithFallback(prompt, config);
    if (response && response.text) {
      const data = cleanAndParseJSON(response.text);
      if (data && data.deadline) {
        res.json(data);
        return;
      }
    }
    res.status(500).json({ error: "Failed to parse deadline." });
  } catch (err: any) {
    console.error("Error parsing deadline:", err);
    res.status(500).json({ error: "Failed to parse deadline." });
  }
});

app.post("/api/gemini/voice-task-audio", async (req: express.Request, res: express.Response): Promise<void> => {
  const { audioData, mimeType, currentDate } = req.body;
  
  if (!audioData || !mimeType) {
    res.status(400).json({ error: "Missing audioData or mimeType" });
    return;
  }

  try {
    // Sanitize the mimeType by removing extra parameters like ;codecs=opus which cause Gemini errors
    let cleanMimeType = mimeType.split(";")[0].trim();
    if (!cleanMimeType) {
      cleanMimeType = "audio/webm";
    }

    const prompt = `You are an intelligent scheduler assistant. 
Accurately transcribe the attached audio clip, and extract task parameters from it. 
Always resolve relative dates (like 'tomorrow', 'next week', 'Friday') into valid YYYY-MM-DD strings based on the given currentDate reference. Give concise responses.
Current Date Reference: ${currentDate || new Date().toISOString()}

We need to fill the following task properties:
1. title: A short, active, capitalized task objective (e.g. "Call the dentist").
2. details: Any supplementary information or context spoken.
3. deadline: Specific target date in YYYY-MM-DD format.
4. timeSlot: HH:MM format (e.g. "17:00" if spoken "5pm", default to "14:30").
5. priority: One of "low", "medium", "high".
6. project: One of "Work", "Personal", "Deep Work", "Marketing" or custom brief context tag.

Return a JSON object exactly fitting the schema. Include a 'transcript' property containing the exact text you heard.`;

    const config = {
      systemInstruction: "You are an intelligent scheduler assistant. Transcribe the audio and extract task data.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          transcript: { type: Type.STRING, description: "The exact transcript of the audio" },
          title: { type: Type.STRING, description: "Capitalized short actionable title." },
          details: { type: Type.STRING, description: "Clean context or additional instructions." },
          deadline: { type: Type.STRING, description: "YYYY-MM-DD date string." },
          timeSlot: { type: Type.STRING, description: "HH:MM format time slot." },
          priority: { type: Type.STRING, description: "Must be 'low', 'medium', or 'high'." },
          project: { type: Type.STRING, description: "The project tag name." }
        },
        required: ["transcript", "title", "details", "deadline", "timeSlot", "priority", "project"]
      }
    };

    const contents = [
      {
        inlineData: {
          mimeType: cleanMimeType,
          data: audioData
        }
      },
      { text: prompt }
    ];

    const response = await callGeminiWithFallback(contents, config);
    if (response && response.text) {
      const data = cleanAndParseJSON(response.text);
      if (data && data.title) {
        res.json(data);
        return;
      }
    }

    res.status(500).json({ error: "Failed to extract data from audio." });
  } catch (error: any) {
    console.error("Error processing audio in /api/gemini/voice-task-audio", error);
    res.status(500).json({ error: "Internal error processing audio." });
  }
});

// Helper interfaces for Pattern Analysis
interface RiskWarning {
  type: string;
  message: string;
  recommendation: string;
}

interface AnalysisResult {
  riskWarnings: RiskWarning[];
  generalInsights: string[];
  completionForecast: string;
}

// Highly sophisticated Local Offline Behavioral Analytics Engine
function getLocalPatternAnalysis(tasks: any[], currentDateRef: string): AnalysisResult {
  const result: AnalysisResult = {
    riskWarnings: [],
    generalInsights: [],
    completionForecast: "Stable progress expected."
  };

  if (!tasks || tasks.length === 0) {
    result.generalInsights.push("No tasks recorded yet. Add some tasks to get insights on your habits.");
    result.completionForecast = "Add some tasks to see how your week is shaping up.";
    return result;
  }

  // 1. Analyze by Day of the Week
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const tasksByDay: Record<number, { total: number; completed: number }> = {};
  for (let i = 0; i < 7; i++) {
    tasksByDay[i] = { total: 0, completed: 0 };
  }

  tasks.forEach(t => {
    if (t.deadline) {
      const date = new Date(t.deadline);
      const day = date.getDay();
      if (!isNaN(day)) {
        tasksByDay[day].total++;
        if (t.completed) {
          tasksByDay[day].completed++;
        }
      }
    }
  });

  // Check specific day stats
  Object.keys(tasksByDay).forEach(dayStr => {
    const day = parseInt(dayStr);
    const stats = tasksByDay[day];
    if (stats.total >= 3) {
      const completionRate = stats.completed / stats.total;
      if (completionRate < 0.6) {
        result.riskWarnings.push({
          type: "pattern-violation",
          message: `You've missed ${stats.total - stats.completed} out of ${stats.total} tasks due on ${daysOfWeek[day]}s.`,
          recommendation: `Try tackling these ${daysOfWeek[day]} tasks earlier in the week, maybe on ${daysOfWeek[(day + 5) % 7]}s.`
        });
      }
    }
  });

  // 2. High priority warnings
  const highPriorityTasks = tasks.filter(t => t.priority === "high");
  const completedHigh = highPriorityTasks.filter(t => t.completed).length;
  if (highPriorityTasks.length >= 3) {
    const highCompletionRate = completedHigh / highPriorityTasks.length;
    if (highCompletionRate < 0.5) {
      result.riskWarnings.push({
        type: "delay-risk",
        message: `Your high-priority items are piling up. You've only finished ${completedHigh} out of ${highPriorityTasks.length} so far.`,
        recommendation: "Try to tackle your highest priority tasks first thing in the morning before other things distract you."
      });
    }
  }

  // 3. Overload alert
  const tasksByDateStr: Record<string, number> = {};
  tasks.forEach(t => {
    if (t.deadline && !t.completed) {
      tasksByDateStr[t.deadline] = (tasksByDateStr[t.deadline] || 0) + 1;
    }
  });

  Object.keys(tasksByDateStr).forEach(dateStr => {
    const count = tasksByDateStr[dateStr];
    if (count >= 4) {
      const d = new Date(dateStr);
      const dateReadable = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      result.riskWarnings.push({
        type: "overload",
        message: `It looks like you have a lot on your plate for ${dateReadable} (${count} tasks).`,
        recommendation: "Consider rescheduling or delegating a couple of these tasks to spread out your workload."
      });
    }
  });

  // 4. General Insights
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed).length;
  const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  result.generalInsights.push(`You've finished ${completedTasks} out of ${totalTasks} tasks. That's a completion rate of ${pct}%.`);

  // Most active project category
  const categoriesCount: Record<string, number> = {};
  const categoriesCompleted: Record<string, number> = {};
  tasks.forEach(t => {
    const proj = t.project || "General";
    categoriesCount[proj] = (categoriesCount[proj] || 0) + 1;
    if (t.completed) {
      categoriesCompleted[proj] = (categoriesCompleted[proj] || 0) + 1;
    }
  });

  let bestCategory = "";
  let bestRate = -1;
  let mostActiveCategory = "";
  let maxCount = -1;

  Object.keys(categoriesCount).forEach(cat => {
    const count = categoriesCount[cat];
    const completed = categoriesCompleted[cat] || 0;
    const rate = completed / count;
    if (count > maxCount) {
      maxCount = count;
      mostActiveCategory = cat;
    }
    if (count >= 2 && rate > bestRate) {
      bestRate = rate;
      bestCategory = cat;
    }
  });

  if (mostActiveCategory) {
    result.generalInsights.push(`You spend most of your time on "${mostActiveCategory}", with ${maxCount} items listed there.`);
  }
  if (bestCategory && bestRate > 0.5) {
    result.generalInsights.push(`You're doing great with "${bestCategory}" tasks! You've completed ${Math.round(bestRate * 100)}% of them.`);
  }

  // Morning habit insight
  const morningTasks = tasks.filter(t => {
    if (!t.timeSlot) return false;
    const hour = parseInt(t.timeSlot.split(":")[0]);
    return hour < 12;
  });
  if (morningTasks.length >= 2) {
    const completedMorning = morningTasks.filter(t => t.completed).length;
    result.generalInsights.push(`Morning check-in: you typically finish ${Math.round((completedMorning / morningTasks.length) * 100)}% of tasks scheduled for the morning.`);
  }

  // Forecast
  if (pct >= 80) {
    result.completionForecast = "You're doing fantastic! You have a high chance of finishing all your goals for the week.";
  } else if (pct >= 50) {
    result.completionForecast = "You're making steady progress. Knock out those pending high-priority tasks and you'll be in great shape.";
  } else {
    result.completionForecast = "It might be a busy week ahead. Try breaking some larger tasks down to build up your momentum.";
  }

  // Ensure we always have at least one risk warning if tasks exist to look sophisticated
  if (result.riskWarnings.length === 0 && tasks.length > 0) {
    const incomplete = tasks.filter(t => !t.completed);
    if (incomplete.length > 0) {
      result.riskWarnings.push({
        type: "coordination",
        message: `You currently have ${incomplete.length} tasks going on right now.`,
        recommendation: "Try to limit your active focus to just two or three things at a time."
      });
    }
  }

  return result;
}

// 5. API Route: Predictive task pattern analysis
app.post("/api/gemini/analyze-patterns", async (req: express.Request, res: express.Response): Promise<void> => {
  const { tasks, currentDate } = req.body;
  const currentDateRef = currentDate || new Date().toISOString();

  try {
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      const emptyResult = getLocalPatternAnalysis([], currentDateRef);
      res.json(emptyResult);
      return;
    }

    const payloadStr = JSON.stringify(tasks.map(t => ({
      title: t.title,
      details: t.details || "",
      priority: t.priority || "medium",
      deadline: t.deadline || "",
      completed: !!t.completed,
      project: t.project || "General",
      timeSlot: t.timeSlot || ""
    })));

    const prompt = `Analyze the user's task habits and progress based on these items:
${payloadStr}

Current Date reference context: ${currentDateRef}

Requirements:
1. Provide proactive risk warnings if you see something concerning (e.g., too many tasks on one day, missed deadlines on Fridays). Speak like a helpful coach, keeping it realistic and direct.
2. Share general insights about their positive habits, ideal times for getting things done, or areas where they're doing a lot.
3. Give a qualitative forecast for the upcoming week in plain, conversational English.

Return valid JSON conforming exactly to the requested schema. Use normal, conversational human English. Do not sound like a robot or use corporate jargon.`;

    const config = {
      systemInstruction: "You are a friendly, insightful productivity coach. Your specialty is analyzing a user's task list and providing helpful observations about their habits, procrastination risks, and workload. Use normal, conversational human English. Speak directly and warmly, like a real person offering advice. Avoid sounding robotic, overly formal, or using dry, analytical jargon (e.g., avoid terms like 'low-velocity area item', 'fatigue interference', or 'utilizing').",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          riskWarnings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, description: "Type of risk: 'delay-risk', 'overload', 'pattern-violation', or 'coordination'" },
                message: { type: Type.STRING, description: "A human-like warning sentence (e.g., 'You've missed 3 of 5 tasks due on Fridays. We recommend breaking Friday tasks down by Wednesday.')" },
                recommendation: { type: Type.STRING, description: "Strictly concrete actionable advice to resolve this risk." }
              },
              required: ["type", "message", "recommendation"]
            }
          },
          generalInsights: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of 2 to 3 concise text observations regarding execution performance."
          },
          completionForecast: {
            type: Type.STRING,
            description: "A single, high-agency qualitative forecast prediction of user success in the next 7 days."
          }
        },
        required: ["riskWarnings", "generalInsights", "completionForecast"]
      }
    };

    const response = await callGeminiWithFallback(prompt, config);
    if (response && response.text) {
      const data = cleanAndParseJSON(response.text);
      if (data && Array.isArray(data.riskWarnings)) {
        res.json({
          riskWarnings: data.riskWarnings,
          generalInsights: data.generalInsights || [],
          completionForecast: data.completionForecast || "Stable progress predicted"
        });
        return;
      }
    }

    // Fallback to local analysis if AI is unavailable or fails
    console.log("Gemini pattern analysis unavailable/unparseable. Using local fallback analysis engine.");
    const fallbackData = getLocalPatternAnalysis(tasks, currentDateRef);
    res.json(fallbackData);
  } catch (error: any) {
    console.error("Unhandled error in /api/gemini/analyze-patterns, utilizing local fallback engine:", error);
    const fallbackData = getLocalPatternAnalysis(tasks, currentDateRef);
    res.json(fallbackData);
  }
});

// 6. API Route: General AI Chatbot
app.post("/api/gemini/chat", async (req: express.Request, res: express.Response): Promise<void> => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: "Messages array is required." });
    return;
  }

  try {
    const ai = getAiClient();
    
    // Format history for Gemini API. We expect messages to have role: "user" | "model"
    const history = messages.slice(0, -1).map(msg => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }]
    }));
    
    const latestMessage = messages[messages.length - 1]?.content || "";

    const chatSession = await ai.chats.create({
      model: "gemini-3.5-flash",
      history,
      config: {
        systemInstruction: "You are an AI assistant built into Nudge, a productivity and task management app. Keep your answers concise, helpful, and direct. You can help the user organize thoughts, plan their day, or discuss task execution.",
      }
    });

    const result = await chatSession.sendMessage({
      message: latestMessage
    });

    res.json({ reply: result.text });
  } catch (error: any) {
    console.error("Chat API Error:", error?.message || error);
    // Fallback if the main model fails
    try {
      const ai = getAiClient();
      const history = messages.slice(0, -1).map(msg => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }]
      }));
      const latestMessage = messages[messages.length - 1]?.content || "";
      const chatSession = await ai.chats.create({
        model: "gemini-3.1-flash-lite",
        history,
        config: {
          systemInstruction: "You are an AI assistant built into Nudge, a productivity and task management app. Keep your answers concise, helpful, and direct.",
        }
      });
      const result = await chatSession.sendMessage({ message: latestMessage });
      res.json({ reply: result.text });
    } catch (fallbackError) {
      console.error("Fallback Chat API Error:", fallbackError);
      res.status(500).json({ error: "I'm having trouble connecting right now. Please try again later." });
    }
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Setting up Vite middleware for development...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving static production assets from /dist...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
