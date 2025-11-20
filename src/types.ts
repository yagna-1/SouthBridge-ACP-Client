import { z } from "zod";

/**
 * Transport interface for ACP communication
 */
export interface Transport {
  readable: ReadableStream;
  writable: WritableStream;
}

/**
 * JSON-RPC 2.0 message structure
 */
export interface JSONRPCMessage {
  jsonrpc: "2.0";
  id: number | string;
  method?: string;
  params?: Record<string, any>;
  result?: any;
  error?: JSONRPCError;
}

/**
 * JSON-RPC 2.0 error object
 */
export interface JSONRPCError {
  code: number;
  message: string;
  data?: any;
}

/**
 * Tool execution result with optional error
 */
export interface ToolResult {
  success?: boolean;
  content?: string;
  entries?: Array<{ name: string; isDirectory: boolean }>;
  error?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  path?: string;
}

/**
 * ACP tool method name mappings
 * Supports various naming conventions from different ACP implementations
 */
export const TOOL_METHODS = {
  WRITE_FILE: ["writeTextFile", "fs/writeTextFile", "fs.writeTextFile"],
  READ_FILE: ["readTextFile", "fs/readTextFile", "fs.readTextFile"],
  LIST_DIRECTORY: ["listDirectory", "fs/listDirectory", "fs.listDirectory"],
  CREATE_TERMINAL: ["createTerminal", "terminal/create", "terminal.create"],
} as const;

/**
 * Helper to check if a method name matches a tool
 */
export function matchesTool(method: string, toolMethods: readonly string[]): boolean {
  return toolMethods.includes(method);
}

/**
 * Base Tool interface
 */
export interface Tool {
  name: string;
  description: string;
  schema: z.ZodType<any>;
  execute: (args: any) => Promise<any>;
}
