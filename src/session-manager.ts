import { writeFile, readFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SESSIONS_DIR = ".acp-sessions";

export interface SessionData {
  sessionId: string;
  model: string;
  workspaceDir: string;
  timestamp: string;
  history: Array<{
    type: "prompt" | "tool_call" | "tool_result";
    data: any;
    timestamp: string;
  }>;
}

/**
 * Saves session state to disk for later resumption
 * @param sessionId - Session identifier
 * @param data - Session data to persist
 */
export async function saveSession(sessionId: string, data: SessionData): Promise<void> {
  try {
    if (!existsSync(SESSIONS_DIR)) {
      await mkdir(SESSIONS_DIR, { recursive: true });
    }
    const filePath = join(SESSIONS_DIR, `${sessionId}.json`);
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (e: any) {
    console.error("Failed to save session:", e.message);
  }
}

/**
 * Loads a saved session from disk
 * @param sessionId - Session identifier to load
 * @returns Session data or null if not found
 */
export async function loadSession(sessionId: string): Promise<SessionData | null> {
  try {
    const filePath = join(SESSIONS_DIR, `${sessionId}.json`);
    if (!existsSync(filePath)) {
      return null;
    }
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (e: any) {
    console.error("Failed to load session:", e.message);
    return null;
  }
}

/**
 * Lists all available saved sessions
 * @returns Array of session IDs
 */
export async function listSessions(): Promise<string[]> {
  try {
    if (!existsSync(SESSIONS_DIR)) return [];
    const files = await readdir(SESSIONS_DIR);
    return files.filter(f => f.endsWith(".json")).map(f => f.replace(".json", ""));
  } catch (e: any) {
    console.error("Failed to list sessions:", e.message);
    return [];
  }
}

/**
 * Deletes a saved session
 * @param sessionId - Session identifier to delete
 */
export async function deleteSession(sessionId: string): Promise<void> {
  try {
    const filePath = join(SESSIONS_DIR, `${sessionId}.json`);
    if (existsSync(filePath)) await unlink(filePath);
  } catch (e: any) {
    console.error("Failed to delete session:", e.message);
  }
}

