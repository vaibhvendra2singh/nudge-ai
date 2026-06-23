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
async function callGeminiWithFallback(contents: string, config: any): Promise<any> {
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
  const { title, details, priority, deadline, subtasks, hoursLeft } = req.body;
  if (!title) {
    res.status(400).json({ error: "Task title is required." });
    return;
  }

  try {
    const subtaskStatus = subtasks && subtasks.length > 0 
      ? `Subtasks remaining:\n${subtasks.map((s: any) => `- [ ] ${s.title}`).join("\n")}`
      : "No subtasks structured yet.";

    const prompt = `This task is highly urgent and due very soon! Provide an authentic, direct, motivational nudge/alert.
Task: ${title} (Priority: ${priority || "medium"})
Details: ${details || "No other details."}
Deadline: ${deadline || "Not specified."}
Time Left: ${hoursLeft ? `${hoursLeft} hours left` : "less than 24 hours left"}
${subtaskStatus}

Provide an authentic, zero-fluff, non-generic, high-agency 1-sentence reasons why this matters right now. Do not use generic clichés or corporate jargon.`;

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
