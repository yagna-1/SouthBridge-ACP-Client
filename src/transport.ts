import type { Transport } from "./types";
import { EventSource } from "eventsource";

/**
 * Creates an SSE-based transport for ACP communication
 * Implements bidirectional communication via SSE (server->client) and HTTP POST (client->server)
 * 
 * @param baseUrl - Base URL of the ACP agent server
 * @returns Transport object with readable and writable streams
 */
export function createSSEStream(baseUrl: string): Transport {
  const eventSourceUrl = new URL("/sse", baseUrl).toString();
  const postUrl = new URL("/messages", baseUrl).toString();

  console.log(`Connecting to SSE at ${eventSourceUrl}`);

  const readable = new ReadableStream<any>({
    start(controller) {
      const es = new EventSource(eventSourceUrl);

      es.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          controller.enqueue(msg);
        } catch (e) {
          console.error("Failed to parse SSE message", e);
        }
      };

      es.onerror = (e: Event) => {
        console.error("SSE Connection Error");
        controller.close();
        es.close();
      };
    },
  });

  const writable = new WritableStream<any>({
    async write(chunk) {
      try {
        const response = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chunk),
        });
        if (!response.ok) {
            console.error(`Failed to send message: ${response.statusText}`);
        }
      } catch (e) {
        console.error("Failed to send message", e);
      }
    },
  });

  return { readable, writable };
}
