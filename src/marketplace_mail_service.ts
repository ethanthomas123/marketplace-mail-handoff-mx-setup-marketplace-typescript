import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiClient, InfraiError } from "./infrai_client.js";
import {
  configureMarketplaceMail,
  marketplaceMailRequestSchema,
} from "./marketplace_mail.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const client = new InfraiClient(apiKey);
const port = Number(process.env.PORT ?? 3000);

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function readJson(request: AsyncIterable<Buffer | string>): Promise<unknown> {
  let raw = "";
  for await (const chunk of request) raw += chunk.toString();
  return JSON.parse(raw);
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/marketplace/mail/setup") {
    sendJson(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const input = marketplaceMailRequestSchema.parse(await readJson(request));
    const result = await configureMarketplaceMail(input, client);
    sendJson(response, 200, result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendJson(response, 400, { error: "Invalid request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      sendJson(response, status, { error: error.code, message: error.message });
      return;
    }
    sendJson(response, 500, { error: "Service error" });
  }
});

server.listen(port, () => {
  console.log(`Marketplace mail service listening on http://localhost:${port}`);
});
