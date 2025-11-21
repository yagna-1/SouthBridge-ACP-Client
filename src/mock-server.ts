import http from "http";

// Simple Mock ACP Server (Node.js compatible)
const PORT = 3000;

const clients = new Set<http.ServerResponse>();
const clientSessions = new Map<http.ServerResponse, { toolCallSent: boolean }>();

function broadcast(msg: any) {
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  for (const client of clients) {
    client.write(data);
  }
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (url.pathname === "/sse") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    clients.add(res);
    clientSessions.set(res, { toolCallSent: false });
    console.log("Client connected to SSE");
    
    req.on("close", () => {
      clients.delete(res);
      clientSessions.delete(res);
      console.log("Client disconnected from SSE");
    });
    return;
  }

  if (url.pathname === "/messages" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) {
        body += chunk;
    }
    const json = JSON.parse(body);
    console.log("Received RPC:", JSON.stringify(json, null, 2));

    // Handle Initialize
    if (json.method === "initialize") {
       const response = {
           jsonrpc: "2.0",
           id: json.id,
           result: {
               serverInfo: { name: "MockAgent", version: "0.0.1" },
               capabilities: {}
           }
       };
       broadcast(response);
       res.end("ok");
       return;
    }

    // Handle session/new
    if (json.method === "session/new") {
       const response = {
           jsonrpc: "2.0",
           id: json.id,
           result: { sessionId: "mock-session-1" }
       };
       broadcast(response);
       res.end("ok");
       return;
    }

    // Handle Prompt - send tool call once per client session
    if (json.method === "session/prompt") {
       // Ack the prompt
       const ack = {
           jsonrpc: "2.0",
           id: json.id,
           result: { stopReason: "tool_use" }
       };
       broadcast(ack);

       // Only send the demo tool call once per connected client
       let shouldSendToolCall = false;
       for (const [client, session] of clientSessions.entries()) {
           if (clients.has(client) && !session.toolCallSent) {
               session.toolCallSent = true;
               shouldSendToolCall = true;
               break;
           }
       }

       if (shouldSendToolCall) {
           setTimeout(() => {
               const toolCallReq = {
                   jsonrpc: "2.0",
                   id: "req_" + Date.now(),
                   method: "writeTextFile", 
                   params: {
                       path: "hello_from_agent.txt",
                       content: "Hello from the Mock Agent! I verified your code works."
                   }
               };
               console.log("Sending Tool Call:", toolCallReq);
               broadcast(toolCallReq);
           }, 1000);
       }
       
       res.end("ok");
       return;
    }

    // Handle Tool Response
    if (json.result !== undefined || json.error !== undefined) {
        console.log("Received Tool Result:", json);
        
        // Send final completion message
        setTimeout(() => {
            const completion = {
                jsonrpc: "2.0",
                method: "session/update",
                params: {
                    content: "Great! The file was written successfully. The client is working perfectly!"
                }
            };
            console.log("Sending completion message");
            broadcast(completion);
        }, 500);
        
        res.end("ok");
        return;
    }

    // Handle generic methods
    if (json.id) {
        // Auto-ack others
        broadcast({
            jsonrpc: "2.0",
            id: json.id,
            result: {}
        });
    }

    res.end("ok");
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`Mock Agent Server running at http://localhost:${PORT}`);
  console.log(`Each new client connection will receive one demo tool call.`);
});
