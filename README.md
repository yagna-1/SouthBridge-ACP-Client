# SouthBridge Takehome - ACP Client

A TypeScript implementation of an ACP Client for Claude Code, built with Bun.

## Setup

### Option 1: Bun (Recommended)
```bash
bun install
bun run src/index.ts
```

### Option 2: Node.js (Compatibility Mode)
```bash
npm install
npx tsx src/index.ts
```

## Environment Variables

```bash
# Optional configuration
export AGENT_URL=http://localhost:3000        # ACP server URL (default: http://localhost:3000)
export MODEL=claude-3-5-sonnet-20241022       # Claude model to use
export WORKSPACE=/path/to/project             # Workspace directory (default: current directory)
```

## Features

### Core Capabilities ✅
- ✅ **Send messages to Claude Code** - Full JSON-RPC 2.0 implementation
- ✅ **Receive messages back** - SSE transport for real-time communication
- ✅ **Approve and reject tool calls** - Interactive prompts with beautiful UI
- ✅ **Model selection** - Configure Claude model via environment or programmatically
- ✅ **Workspace directory** - Set project context for file operations
- ✅ **File operations** - Create, read, and list files/directories
- ✅ **Shell commands** - Execute terminal commands with Bun.spawn (Node fallback)

### Extra Credit Features ✅
- ✅ **Streaming** - Real-time SSE communication
- ✅ **Good Terminal UI** - Chalk colors, Boxen frames, status indicators
- ✅ **Resumable Sessions** - Save/load session state with full history

### Safety & Observability
- **User Approval:** All tool calls require explicit confirmation
- **Audit Trail:** Complete session log in `session.log`
- **Error Handling:** Graceful failures with informative messages
- **Type Safety:** Full TypeScript with strict mode, Zod validation

## Testing with Mock Server

Since Claude Code requires a paid API key, a mock server is included for testing:

```bash
# Terminal 1: Start mock server
npx tsx src/mock-server.ts

# Terminal 2: Run client
npx tsx src/index.ts
```

The mock server simulates an agent that requests file operations, allowing you to test the approval flow.

## AI Assistance Disclosure
- **Planning:** Used Claude 3.5 Sonnet for ACP Protocol Analysis and architecture design.
- **Coding:** Used Claude 3.5 Sonnet for Zod Schema generation, TypeScript implementation, and SDK integration.
- **Debugging:** Used AI to resolve Bun/Node compatibility issues, SSE transport implementation, and SDK method routing.
- **Testing:** Created mock server with AI assistance to demonstrate functionality without paid API access.
- **Verification:** Manual review and testing by developer. All code understood and approved before submission.
