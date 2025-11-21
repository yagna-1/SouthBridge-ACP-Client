import { createSSEStream } from "./transport";
import { readFile, writeFile, listDir } from "./tools/fs";
import { runShellCommand } from "./tools/shell";
import inquirer from "inquirer";
import { logReceipt } from "./utils";
import chalk from "chalk";
import boxen from "boxen";
import type { Transport, JSONRPCMessage, ToolResult } from "./types";
import { TOOL_METHODS, matchesTool } from "./types";
import { saveSession, loadSession, type SessionData } from "./session-manager";

/**
 * ACP Client for communicating with coding agents
 * Implements the Agent Client Protocol with interactive tool approval
 */
export class CodingAgentClient {
  private transport!: Transport;
  private sessionId: string | undefined;
  private requestId = 0;
  private writeQueue: JSONRPCMessage[] = [];
  private isWriting = false;
  private model: string;
  private workspaceDir: string;
  private history: SessionData["history"] = [];
  private autoSave = true;

  /**
   * Creates a new ACP client
   * @param url - The base URL of the ACP agent server
   * @param model - Claude model to use (default: claude-3-5-sonnet-20241022)
   * @param workspaceDir - Workspace directory path (default: current working directory)
   */
  constructor(
    private url: string,
    model?: string,
    workspaceDir?: string
  ) {
    this.model = model || "claude-3-5-sonnet-20241022";
    this.workspaceDir = workspaceDir || process.cwd();
  }

  /**
   * Initializes the session and connects to the agent
   * Sends capability advertisement and establishes SSE connection
   */
  async startSession(): Promise<void> {
    this.transport = createSSEStream(this.url);
    
    const reader = this.transport.readable.getReader();
    this.readMessages(reader);
    
    await this.sendRPC("initialize", {
      capabilities: {
        "fs.readTextFile": true,
        "fs.writeTextFile": true,
        "fs.listDirectory": true,
        "terminal": true,
      },
      clientInfo: {
        name: "SouthBridgeClient",
        version: "1.0.0",
      },
      workspaceDirectory: this.workspaceDir,
      model: this.model,
    });
    
    console.log(chalk.green("✓") + " Connected to Agent");
    console.log(chalk.gray("Model:"), chalk.white(this.model));
    console.log(chalk.gray("Workspace:"), chalk.white(this.workspaceDir));
    console.log();
    await logReceipt("INFO", { 
      event: "Connected to Agent", 
      model: this.model, 
      workspace: this.workspaceDir 
    });
  }

  /**
   * Continuously reads and processes messages from the agent
   * @param reader - ReadableStream reader for incoming messages
   */
  private async readMessages(reader: ReadableStreamDefaultReader): Promise<void> {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        await this.handleMessage(value);
      }
    } catch (e: any) {
      console.error(chalk.red("✗ Stream error:"), e.message);
    }
  }

  /**
   * Routes incoming messages to appropriate handlers
   * @param msg - JSON-RPC message from the agent
   */
  private async handleMessage(msg: JSONRPCMessage): Promise<void> {
    if (!msg.method) {
      if (msg.result) {
        await logReceipt("INFO", msg);
      }
      return;
    }

    if (matchesTool(msg.method, TOOL_METHODS.WRITE_FILE)) {
      await this.handleToolCall("writeTextFile", msg.id as string, msg.params || {});
    } else if (matchesTool(msg.method, TOOL_METHODS.READ_FILE)) {
      await this.handleToolCall("readTextFile", msg.id as string, msg.params || {});
    } else if (matchesTool(msg.method, TOOL_METHODS.LIST_DIRECTORY)) {
      await this.handleToolCall("listDirectory", msg.id as string, msg.params || {});
    } else if (matchesTool(msg.method, TOOL_METHODS.CREATE_TERMINAL)) {
      await this.handleToolCall("createTerminal", msg.id as string, msg.params || {});
    }
  }

  /**
   * Handles tool call requests with user approval
   * @param toolName - Name of the tool being invoked
   * @param requestId - JSON-RPC request ID for response correlation
   * @param params - Tool parameters
   */
  private async handleToolCall(
    toolName: string,
    requestId: string,
    params: Record<string, any>
  ): Promise<void> {
    console.log("\n" + boxen(
      chalk.bold.cyan("🔧 Tool Request") + "\n\n" +
      chalk.yellow("Tool: ") + chalk.white(toolName) + "\n" +
      chalk.yellow("Params: ") + chalk.gray(JSON.stringify(params, null, 2)),
      {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "cyan"
      }
    ));
    
    this.history.push({
      type: "tool_call",
      data: { tool: toolName, params },
      timestamp: new Date().toISOString(),
    });
    
    await logReceipt("TOOL_CALL", { tool: toolName, params });
    
    const { approved } = await inquirer.prompt([
      {
        type: "confirm",
        name: "approved",
        message: chalk.bold("Approve this tool call?"),
        default: true,
      },
    ]);

    if (!approved) {
      console.log(chalk.red("✗ Rejected by user\n"));
      await logReceipt("TOOL_ERROR", "User rejected");
      await this.sendRPCResponse(requestId, null, {
        code: -32000,
        message: "User rejected tool call"
      });
      return;
    }

    console.log(chalk.green("✓ Approved") + " - Executing...\n");

    try {
      let result: ToolResult;
      
      switch (toolName) {
        case "writeTextFile":
          result = await writeFile(params.path, params.content);
          if (result.error) throw new Error(result.error);
          console.log(chalk.green("✓ File written:"), chalk.white(params.path));
          this.history.push({
            type: "tool_result",
            data: { tool: toolName, result: { success: true } },
            timestamp: new Date().toISOString(),
          });
          await logReceipt("TOOL_RESULT", { success: true });
          await this.sendRPCResponse(requestId, {});
          break;
          
        case "readTextFile":
          result = await readFile(params.path);
          if (result.error) throw new Error(result.error);
          console.log(chalk.green("✓ File read:"), chalk.white(params.path));
          console.log(chalk.gray("Content length:"), result.content?.length, "bytes");
          await logReceipt("TOOL_RESULT", { content: result.content });
          await this.sendRPCResponse(requestId, { content: result.content });
          break;
          
        case "listDirectory":
          result = await listDir(params.path || ".");
          if (result.error) throw new Error(result.error);
          console.log(chalk.green("✓ Listed directory:"), chalk.white(params.path || "."));
          console.log(chalk.gray("Entries:"), result.entries?.length);
          await logReceipt("TOOL_RESULT", result);
          await this.sendRPCResponse(requestId, { entries: result.entries });
          break;
          
        case "createTerminal":
          console.log(chalk.cyan("$>"), params.command, (params.args || []).join(" "));
          result = await runShellCommand(params.command, params.args || []);
          
          if (result.stdout) {
            console.log(chalk.gray("stdout:"));
            console.log(result.stdout);
          }
          if (result.stderr) {
            console.log(chalk.yellow("stderr:"));
            console.log(result.stderr);
          }
          console.log(chalk.gray("Exit code:"), result.exitCode);
          
          await logReceipt("TOOL_RESULT", result);
          await this.sendRPCResponse(requestId, { 
            id: "terminal-1", 
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr
          });
          break;
          
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error: any) {
      console.log(chalk.red("✗ Error:"), error.message);
      await logReceipt("TOOL_ERROR", error.message);
      await this.sendRPCResponse(requestId, null, {
        code: -32603,
        message: error.message
      });
    }
    
    await this.persistSession();
    console.log();
  }

  /**
   * Sends a user prompt to the agent
   * Creates a session if one doesn't exist
   * @param message - The user's prompt message
   */
  async sendPrompt(message: string): Promise<void> {
    await logReceipt("PROMPT", message);
    
    if (!this.sessionId) {
      const sessionResp = await this.sendRPC("session/new", {});
      this.sessionId = sessionResp?.sessionId || `session-${Date.now()}`;
    }

    this.history.push({
      type: "prompt",
      data: message,
      timestamp: new Date().toISOString(),
    });

    await this.sendRPC("session/prompt", {
      prompt: {
        role: "user",
        content: [{ type: "text", text: message }]
      }
    });

    await this.persistSession();
  }

  /**
   * Processes queued writes to prevent stream locking
   */
  private async processWriteQueue(): Promise<void> {
    if (this.isWriting) return;
    
    this.isWriting = true;
    while (this.writeQueue.length > 0) {
      const msg = this.writeQueue.shift();
      if (!msg) continue;
      
      try {
        const writer = this.transport.writable.getWriter();
        await writer.write(msg);
        writer.releaseLock();
      } catch (e: any) {
        console.error(chalk.red("Write error:"), e.message);
      }
    }
    this.isWriting = false;
  }

  /**
   * Sends a JSON-RPC request to the agent
   * @param method - RPC method name
   * @param params - Method parameters
   * @returns Promise resolving to null (responses come via SSE)
   */
  private async sendRPC(method: string, params: Record<string, any>): Promise<any> {
    const msg: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: this.requestId++,
      method,
      params
    };
    
    this.writeQueue.push(msg);
    await this.processWriteQueue();
    
    return null;
  }

  /**
   * Sends a JSON-RPC response to a tool call
   * @param id - Request ID to respond to
   * @param result - Result object (null if error)
   * @param error - Error object (null if success)
   */
  private async sendRPCResponse(
    id: string,
    result: any = null,
    error: { code: number; message: string } | null = null
  ): Promise<void> {
    const msg: JSONRPCMessage = {
      jsonrpc: "2.0",
      id,
      ...(error ? { error } : { result })
    };
    
    this.writeQueue.push(msg);
    await this.processWriteQueue();
  }

  /**
   * Gets the system prompt with workspace context
   * @returns System prompt string
   */
  public getSystemPrompt(): string {
    return `Current Workspace: ${this.workspaceDir}`;
  }

  /**
   * Gets the current model being used
   * @returns Model identifier
   */
  public getModel(): string {
    return this.model;
  }

  /**
   * Gets the workspace directory
   * @returns Workspace directory path
   */
  public getWorkspaceDir(): string {
    return this.workspaceDir;
  }

  /**
   * Sets a new model for the session
   * Note: Requires creating a new session to take effect
   * @param model - New model identifier
   */
  public setModel(model: string): void {
    this.model = model;
    console.log(chalk.yellow("⚠ Model changed to:"), chalk.white(model));
    console.log(chalk.gray("Note: Start a new session for this to take effect"));
  }

  /**
   * Sets a new workspace directory
   * @param workspaceDir - New workspace directory path
   */
  public setWorkspaceDir(workspaceDir: string): void {
    this.workspaceDir = workspaceDir;
    console.log(chalk.yellow("⚠ Workspace changed to:"), chalk.white(workspaceDir));
  }

  /**
   * Persists current session state to disk
   */
  private async persistSession(): Promise<void> {
    if (!this.autoSave || !this.sessionId) return;

    const sessionData: SessionData = {
      sessionId: this.sessionId,
      model: this.model,
      workspaceDir: this.workspaceDir,
      timestamp: new Date().toISOString(),
      history: this.history,
    };

    await saveSession(this.sessionId, sessionData);
  }

  /**
   * Resumes a previously saved session
   * @param sessionId - Session ID to resume
   * @returns True if session was successfully resumed
   */
  async resumeSession(sessionId: string): Promise<boolean> {
    const sessionData = await loadSession(sessionId);
    if (!sessionData) {
      console.log(chalk.red("✗ Session not found:"), sessionId);
      return false;
    }

    this.sessionId = sessionData.sessionId;
    this.model = sessionData.model;
    this.workspaceDir = sessionData.workspaceDir;
    this.history = sessionData.history;

    console.log(chalk.green("✓ Session resumed:"), chalk.white(sessionId));
    console.log(chalk.gray("Model:"), chalk.white(this.model));
    console.log(chalk.gray("Workspace:"), chalk.white(this.workspaceDir));
    console.log(chalk.gray("History entries:"), chalk.white(this.history.length));
    console.log();

    await logReceipt("INFO", { event: "Session resumed", sessionId, historyLength: this.history.length });
    return true;
  }

  /**
   * Gets current session ID
   * @returns Session ID or undefined
   */
  public getSessionId(): string | undefined {
    return this.sessionId;
  }

  /**
   * Enables or disables auto-save of session state
   * @param enabled - Whether to auto-save
   */
  public setAutoSave(enabled: boolean): void {
    this.autoSave = enabled;
  }
}
