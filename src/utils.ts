import { appendFile } from "node:fs/promises";

/**
 * Log types for session audit trail
 */
export type LogType = "PROMPT" | "TOOL_CALL" | "TOOL_RESULT" | "TOOL_ERROR" | "INFO" | "ERROR";

/**
 * Logs an action to the session.log file for audit trail
 * Creates a timestamped entry with type and data
 * 
 * @param type - Type of log entry
 * @param data - Data to log (will be JSON stringified)
 */
export async function logReceipt(type: LogType, data: any): Promise<void> {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${type}] ${JSON.stringify(data, null, 2)}\n---\n`;

  try {
    await appendFile("session.log", logEntry);
  } catch (e) {
    console.error("Failed to write to session.log", e);
  }
}
