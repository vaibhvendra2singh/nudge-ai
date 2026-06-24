# Nudge — Your Last-Minute Life Saver

Nudge is an AI-powered productivity companion built for the **Vibe2Ship Hackathon** (Coding Ninjas x Google for Developers), addressing the problem statement *"The Last-Minute Life Saver."*

Unlike traditional to-do apps that rely on passive reminders, Nudge actively helps users break down, prioritize, and act on tasks before deadlines are missed — using Gemini to reason about urgency, generate actionable subtasks, and nudge users toward what matters most right now.

With our newly added **Cross-Device Cloud Sync**, you can now take Nudge with you on your phone or any other browser, keeping your tasks synced in real-time across all your devices.

---

## What the Project Does

Tasks are automatically grouped into **Urgent Now** (due within 24 hours), **Soon** (within 3 days), and **Future**, plus an archive of **Resolved** tasks. Categorization is recalculated live against the real current time — not static labels.

Instead of showing plain task cards, Nudge evaluates deadline proximity and uses Gemini to generate:
- Personalized action checklists for each task
- Direct, specific nudge messages for urgent tasks
- A single-sentence priority summary across all urgent items

### Core Benefits
- **Frictionless capture** — log tasks hands-free via natural speech
- **Intelligent breakdown** — turns vague tasks into concrete subtasks automatically
- **Procrastination prevention** — direct, jargon-free nudges for urgent tasks
- **Cross-Device Sync** — Google Account login to seamlessly sync all tasks across phones, tablets, and laptops
- **Calendar interoperability** — exports to Google Calendar, Outlook, and Apple Calendar

---

## Feature Directory

### 1. Cross-Device Cloud Sync (New)
**What it does:** Allows you to securely connect your Google Account and sync your custom task logs, custom subtask checklist completions, and profile preferences live across multiple devices (e.g., logging a task on desktop AI Studio and marking it off on your phone).

**How it works:**
- **Supabase Auth & Google OAuth:** Integrated securely with Google Identity via Supabase authentication.
- **Real-Time Subscriptions:** Leverages Supabase Realtime Channels (`postgres_changes`) to push live updates instantaneously to any connected browser or phone. If you add, edit, or delete a task on one device, it reflects instantly on your others.
- **Flexible JSON Schema:** Stores entire task states (including custom subtask completions) inside a robust Postgres database table with flexible JSONb column payloads, meaning it preserves your local state structure perfectly when transitioning to the cloud.
- **Smart URL/Iframe Sandbox Management:** Automatically detects development domains (`ais-dev-`) vs public preview domains (`ais-pre-`) to direct the OAuth popup out of sandboxed iframes safely, avoiding cross-origin cookies blocking issues.

### 2. AI Voice Task Extraction
**What it does:** Users speak a task naturally (e.g. *"remind me to schedule a dentist checkup by tomorrow 3pm, high priority"*). The app transcribes it and maps it directly into the Title, Description, Deadline, and Priority fields — no typing required.

**How it works:**
- The frontend uses the browser's native **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`) to capture and transcribe speech locally.
- The transcript is sent to `/api/gemini/extract-task` along with the current ISO timestamp.
- **Gemini 3.5 Flash** resolves relative time references (e.g. "tomorrow," "Friday") into exact dates, maps the result to a structured JSON schema, and pre-fills the Add Task form.

### 3. Intelligent Urgency Nudges
**What it does:** Generates a short, direct, specific reason a task matters right now — not generic motivational filler.

**How it works:**
- `/api/nudge` receives the task's title, deadline, details, and priority.
- Gemini is prompted to return exactly one direct, human-sounding sentence under 15 words.
- If the API is unavailable or rate-limited, a local fallback message is shown so the UI never breaks — this is a backup path only, not the primary behavior.

### 4. Dynamic Checklist Breakdowns
**What it does:** Breaks an abstract or overwhelming task into concrete, actionable subtasks.

**How it works:**
- The task detail view calls `/api/breakdown` with the task's title and description.
- Gemini returns up to 5 specific action items, rendered as interactive checkboxes that track completion.

### 5. "Needs Action Now" Summary
**What it does:** Surfaces a single, prioritized briefing of what to tackle first across all urgent, incomplete tasks.

**How it works:**
- The frontend filters tasks due within 24 hours with no completed subtasks.
- `/api/needs-action-summary` sends this filtered list to Gemini, which returns one clear sentence on what to clear first.

### 6. Universal Calendar Sync (.ics Export)
**What it does:** One-click download of a calendar event for any task.

**How it works:**
- A helper utility (`downloadICSFile`) maps the task's title, deadline, and details into standard iCalendar format.
- Generates a `.ics` file (`text/calendar; charset=utf-8`) that opens directly in Google Calendar, Outlook, or Apple Calendar.

### 7. Adaptive Empty States
**What it does:** Replaces blank sections with calm, helpful placeholder messaging instead of empty space.

**How it works:**
- Components detect zero-length task arrays per category and render a styled, low-contrast placeholder instead of nothing.

---

## Installation (Progressive Web App)

Nudge is built as a Progressive Web App (PWA) and can be installed directly to your device for an app-like experience.

- **On Android Chrome**: Tap the three-dot menu → "Add to Home Screen" OR tap the install banner when it appears at the bottom of the screen.
- **On iOS Safari**: Tap the Share button <span class="material-symbols-outlined text-[12px] inline-block align-middle">ios_share</span> → "Add to Home Screen".
- **On desktop Chrome/Edge**: Click the install icon in the address bar on the right side.

Once installed, the app works offline for core features (saving and viewing tasks). Note that AI features (such as smart breakdown and nudges) require an internet connection.

---

## Technical Stack & Architecture

```
┌──────────────────────────────────────┐        ┌──────────────────────────────┐
│        React 18 + TypeScript         │        │      Web Speech API          │
│        (Vite, Tailwind CSS)          │        │  Local mic capture +         │
│  Supabase Auth & Real-Time Sync      │        │  raw transcription           │
└──────────────────┬───────────────────┘        └───────────────┬──────────────┘
                   │                                            │
                   │     - Real-Time Postgres Updates           │
                   │     - Google OAuth Auth Flows              │
                   ▼                                            │
┌──────────────────────────────────────┐                        │
│         Supabase Cloud Backend       │                        │
│  - Table: tasks (with task_data)      │                        │
│  - Table: users (profile setting)     │                        │
└──────────────────────────────────────┘                        │
                   ▲                                            │
                   │     POST /api/nudge                        │
                   │     POST /api/breakdown                    │
                   │     POST /api/needs-action-summary          │
                   │                       POST /api/gemini/extract-task
                   ▼                                            ▼
        ┌────────────────────────────────────────────────────────────┐
        │                 Express Server (Node.js)                   │
        │   - Runs on 0.0.0.0:3000 (Docker / Cloud Run)              │
        │   - Holds GEMINI_API_KEY server-side only                  │
        └─────────────────────────────┬──────────────────────────────┘
                                      ▼
                        ┌──────────────────────────┐
                        │    Gemini 3.5 Flash      │
                        │  via @google/genai SDK   │
                        └──────────────────────────┘
```

- **Frontend:** React 18 + TypeScript, built with Vite, styled with Tailwind CSS.
- **Backend:** Express (Node.js) server acting as a secure proxy — the Gemini API key never reaches the browser.
- **Cloud Database & Sync:** Supabase Postgres and Realtime Channels for seamless synchronization.
- **AI:** `@google/genai` SDK calling **Gemini 3.5 Flash**, with structured JSON response schemas.
- **Browser APIs:** Web Speech API (voice input), Blob/file download (calendar export).
- **Persistence:** Local fallback if offline; automatically persists to Supabase Cloud on successful Google sign-in.
- **Deployment:** Google Cloud Run.

---

## Live Demo

🔗 [https://nudge-960957466764.asia-southeast1.run.app](https://nudge-960957466764.asia-southeast1.run.app)

---

## Built With

Built using **Google AI Studio (Build)** for full-stack generation and **Google Stitch** for UI design, as part of the Vibe2Ship Hackathon.
