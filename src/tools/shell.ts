import { z } from "zod";
import { logReceipt } from "../utils";
import { spawn } from "node:child_process";
import type { ToolResult } from "../types";

export const RunShellSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
});

/**
 * Executes a shell command
 * Uses Bun.spawn if available, falls back to Node.js child_process
 * 
 * @param command - Command to execute
 * @param args - Command arguments (default: empty array)
 * @returns ToolResult with stdout, stderr, and exit code
 */
export async function runShellCommand(command: string, args: string[] = []): Promise<ToolResult> {
  console.log(`$> ${command} ${args.join(" ")}`);
  await logReceipt("INFO", `Running shell command: ${command} ${args.join(" ")}`);
  
  if (typeof Bun !== "undefined") {
    try {
      const proc = Bun.spawn([command, ...args], { stdout: "pipe", stderr: "pipe" });
      return {
        exitCode: await proc.exited,
        stdout: await new Response(proc.stdout).text(),
        stderr: await new Response(proc.stderr).text()
      };
    } catch (e: any) {
      return { exitCode: 1, stdout: "", stderr: e.message };
    }
  }

  return new Promise((resolve) => {
    const proc = spawn(command, args);
    let stdout = "";
    let stderr = "";
    
    proc.stdout.on("data", (d) => stdout += d.toString());
    proc.stderr.on("data", (d) => stderr += d.toString());
    proc.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
    proc.on("error", (e) => resolve({ exitCode: 1, stdout: "", stderr: e.message }));
  });
}
