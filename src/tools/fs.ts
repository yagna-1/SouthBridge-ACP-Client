import { z } from "zod";
import { readdir, readFile as fsReadFile, writeFile as fsWriteFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { ToolResult } from "../types";

export const ReadFileSchema = z.object({
  path: z.string().describe("The path to the file to read"),
});

export const WriteFileSchema = z.object({
  path: z.string().describe("The path to the file to write"),
  content: z.string().describe("The content to write to the file"),
});

export const ListDirSchema = z.object({
  path: z.string().optional().describe("The directory to list (default: current)"),
});

/**
 * Reads a file from the filesystem
 * Uses Bun.file if available, falls back to Node.js fs
 * 
 * @param path - Path to the file
 * @returns ToolResult with content or error
 */
export async function readFile(path: string): Promise<ToolResult> {
  try {
    if (typeof Bun !== "undefined") {
      const file = Bun.file(path);
      if (!(await file.exists())) return { error: `File not found: ${path}` };
      return { content: await file.text() };
    }
    if (!existsSync(path)) return { error: `File not found: ${path}` };
    return { content: await fsReadFile(path, "utf-8") };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Writes content to a file
 * Uses Bun.write if available, falls back to Node.js fs
 * 
 * @param path - Path to the file
 * @param content - Content to write
 * @returns ToolResult with success status or error
 */
export async function writeFile(path: string, content: string): Promise<ToolResult> {
  try {
    typeof Bun !== "undefined" 
      ? await Bun.write(path, content)
      : await fsWriteFile(path, content, "utf-8");
    return { success: true, path };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Lists directory contents
 * 
 * @param path - Directory path (defaults to current directory)
 * @returns ToolResult with entries array or error
 */
export async function listDir(path: string = "."): Promise<ToolResult> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return {
      entries: entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
      })),
    };
  } catch (e: any) {
    return { error: e.message };
  }
}
