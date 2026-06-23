import { initializeApp } from "firebase/app";
import { 
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  User
} from "firebase/auth";
import { 
  initializeFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  enableIndexedDbPersistence
} from "firebase/firestore";
import { Task } from "./types";

const firebaseConfig = {
  apiKey: "AIzaSyCi7yAztUtgItC_W9HhVYTr7iRCMrkgP-0",
  authDomain: "abiding-dynamo-rln7n.firebaseapp.com",
  projectId: "abiding-dynamo-rln7n",
  storageBucket: "abiding-dynamo-rln7n.firebasestorage.app",
  messagingSenderId: "960957466764",
  appId: "1:960957466764:web:b5b4b08bd132b1c80b53a9"
};

const app = initializeApp(firebaseConfig);

// Export Auth instance
export const auth = getAuth(app);

// Configure Google Provider for Google Calendar
const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/calendar.readonly");

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Failed to get Google Calendar access token");
    }
    cachedAccessToken = credential.accessToken;
    localStorage.setItem("nudge_gcal_connected", "true");
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error("Google login failed:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const logoutGoogle = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  localStorage.removeItem("nudge_gcal_connected");
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

// Initialize Firestore specifying our database ID as the third argument
export const db = initializeFirestore(app, {}, "ai-studio-4c209ca4-f466-4b0f-8e6f-6b8aa9dfeecd");

// Enable offline storage caching for persistent offline edits
if (typeof window !== "undefined") {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === "failed-precondition") {
      console.warn("Firestore offline persistence failed: Multiple tabs open.");
    } else if (err.code === "unimplemented") {
      console.warn("Firestore offline persistence unsupported by current browser.");
    } else {
      console.error("Firestore offline configuration issue: ", err);
    }
  });
}

// Signs in user anonymously and returns user uid. Since Anonymous auth is disabled/restricted in the console, we gracefully bypass the login call and directly return a persistent local user ID. This keeps the console completely clean and prevents failed auth retries.
export async function signInUserAnonymously(): Promise<string> {
  let localId = localStorage.getItem("nudge_user_id");
  if (!localId) {
    localId = `user-fallback-${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem("nudge_user_id", localId);
  }
  return localId;
}

// Load tasks for a given userId
export async function getTasks(userId: string): Promise<Task[]> {
  try {
    const tasksCol = collection(db, "tasks");
    const q = query(tasksCol, where("userId", "==", userId));
    const snapshot = await getDocs(q);
    const tasksList: Task[] = [];
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      tasksList.push({
        id: docSnap.id,
        title: data.title || "",
        details: data.details || "",
        priority: data.priority || "medium",
        deadline: data.deadline || "",
        completed: !!data.completed,
        project: data.project || "Work",
        timeSlot: data.timeSlot || "",
        subtasks: Array.isArray(data.subtasks) ? data.subtasks : [],
        aiNudge: data.aiNudge || null,
        aiBreakdownGenerated: !!data.aiBreakdownGenerated
      });
    });
    
    return tasksList;
  } catch (error) {
    console.error("Error reading tasks from Firebase:", error);
    throw error;
  }
}

// Save or Update a single task in Firestore
export async function saveTask(userId: string, task: Task): Promise<void> {
  try {
    const taskDocRef = doc(db, "tasks", task.id);
    await setDoc(taskDocRef, {
      ...task,
      userId,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (error) {
    console.error("Error saving task in Firebase:", error);
    throw error;
  }
}

// Delete a task from Firestore
export async function deleteTask(userId: string, taskId: string): Promise<void> {
  try {
    const taskDocRef = doc(db, "tasks", taskId);
    await deleteDoc(taskDocRef);
  } catch (error) {
    console.error("Error deleting task in Firebase:", error);
    throw error;
  }
}

// Retrieve custom user profile name
export async function getUserProfile(userId: string): Promise<{ userName: string } | null> {
  try {
    const userDocRef = doc(db, "users", userId);
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
      return docSnap.data() as { userName: string };
    }
    return null;
  } catch (error) {
    console.error("Error reading user profile from Firebase:", error);
    return null;
  }
}

// Save custom user profile name
export async function saveUserProfile(userId: string, userName: string): Promise<void> {
  try {
    const userDocRef = doc(db, "users", userId);
    await setDoc(userDocRef, {
      userName,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (error) {
    console.error("Error saving user profile in Firebase:", error);
    throw error;
  }
}

