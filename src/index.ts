import { CodingAgentClient } from "./client";
import { listSessions } from "./session-manager";
import chalk from "chalk";
import boxen from "boxen";
import inquirer from "inquirer";

async function main() {
  console.clear();
  console.log(boxen(
    chalk.bold.blue("SouthBridge ACP Client") + "\n\n" +
    chalk.gray("A TypeScript client for Agent Client Protocol") + "\n" +
    chalk.gray("Built with Bun • Type-safe • Interactive"),
    {
      padding: 1,
      margin: 1,
      borderStyle: "double",
      borderColor: "blue",
      textAlignment: "center"
    }
  ));

  const AGENT_URL = process.env.AGENT_URL || "http://localhost:3000";
  const MODEL = process.env.MODEL || "claude-3-5-sonnet-20241022";
  const WORKSPACE = process.env.WORKSPACE || process.cwd();

  console.log(chalk.gray("Agent URL:"), chalk.white(AGENT_URL));
  console.log();

  const client = new CodingAgentClient(AGENT_URL, MODEL, WORKSPACE);
  
  try {
    const sessions = await listSessions();
    let resumed = false;

    if (sessions.length > 0) {
      const { action } = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: "Found existing sessions. What would you like to do?",
          choices: [
            { name: "Start new session", value: "new" },
            { name: "Resume existing session", value: "resume" },
          ],
        },
      ]);

      if (action === "resume") {
        const { selectedSession } = await inquirer.prompt([
          {
            type: "list",
            name: "selectedSession",
            message: "Select a session to resume:",
            choices: sessions.map(s => ({ name: s, value: s })),
          },
        ]);

        await client.startSession();
        resumed = await client.resumeSession(selectedSession);
      }
    }

    if (!resumed) {
      await client.startSession();
    }
    
    if (!resumed) {
      const systemPrompt = client.getSystemPrompt();
      await client.sendPrompt(`You are a coding agent. ${systemPrompt}`);
    }

    console.log(chalk.bold.green("Ready!") + " Enter your commands below (Ctrl+C to quit)\n");
    console.log(chalk.gray("─".repeat(60)) + "\n");
    
    process.on('SIGINT', () => {
        console.log("\n\n" + chalk.yellow("👋 Goodbye!\n"));
        process.exit(0);
    });
    
    const readline = await import('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.blue("→ "),
    });
    
    rl.prompt();
    
    for await (const line of rl) {
        if (line.trim()) {
            await client.sendPrompt(line);
        }
        rl.prompt();
    }

  } catch (error) {
    console.error(chalk.red("\n✗ Fatal Error:"), error);
    process.exit(1);
  }
}

main();
