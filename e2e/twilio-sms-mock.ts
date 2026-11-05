import { createServer, type Server } from "node:http";

/**
 * Local stand-in for Twilio's Messages API (send only). The app is pointed here through
 * TWILIO_API_BASE in playwright.config.ts, so tests never send a real text.
 */
export const TWILIO_MOCK_PORT = Number(process.env.E2E_TWILIO_MOCK_PORT ?? 3197);
export const TWILIO_TEST_SID = `AC${"e2e0".repeat(8)}`; // matches playwright.config.ts (test-only)

export type TwilioSmsMock = {
  server: Server;
  sent: {
    to: string;
    from: string | null;
    body: string;
    statusCallback: string | null;
    sid: string;
  }[];
};

export function startTwilioSmsMock(): Promise<TwilioSmsMock> {
  const sent: TwilioSmsMock["sent"] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (
        req.method !== "POST" ||
        req.url !== `/2010-04-01/Accounts/${TWILIO_TEST_SID}/Messages.json`
      )
        return json(404, { message: "Not found" });
      if (!req.headers.authorization?.startsWith("Basic ")) return json(401, { message: "Auth" });
      const p = new URLSearchParams(raw);
      const sid = `SM${String(sent.length + 1).padStart(32, "0")}`;
      sent.push({
        to: p.get("To") ?? "",
        from: p.get("From"),
        body: p.get("Body") ?? "",
        statusCallback: p.get("StatusCallback"),
        sid,
      });
      json(201, { sid, status: "queued" });
    });
  });
  return new Promise((resolve) =>
    server.listen(TWILIO_MOCK_PORT, "127.0.0.1", () => resolve({ server, sent })),
  );
}
