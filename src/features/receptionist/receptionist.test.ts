import { describe, expect, it } from "vitest";

import { receptionistConfig } from "./config";
import { elevenLabsSignature, parsePostCall, verifyElevenLabs } from "./elevenlabs";
import { chooseRoute, detectLanguage, isOpen, parseHours, type Route } from "./routing";
import {
  callStatusOutcome,
  dialAnswered,
  dialTwiml,
  sipTwiml,
  twilioSignature,
  verifyTwilio,
  voicemailTwiml,
} from "./twilio";

const routes: Route[] = [
  {
    id: "sam",
    name: "Sam",
    forward_to: "+16195550100",
    keywords: ["sell", "buy", "offer"],
    languages: ["en", "es"],
    is_default: true,
  },
  {
    id: "pm",
    name: "Property management",
    forward_to: null,
    keywords: ["repair", "tenant", "maintenance", "leak", "fuga", "reparación"],
    languages: ["en", "es"],
    is_default: false,
  },
  {
    id: "vi",
    name: "Vianney",
    forward_to: "+16195550101",
    keywords: ["showing", "tour"],
    languages: ["es"],
    is_default: false,
  },
];

describe("routing", () => {
  it("picks the route with the most keyword hits; default when nothing matches", () => {
    expect(
      chooseRoute(routes, "Hi, I'm a tenant and there's a leak in the kitchen", "en")?.id,
    ).toBe("pm");
    expect(chooseRoute(routes, "I want to sell my fourplex", "en")?.id).toBe("sam");
    expect(chooseRoute(routes, "Just calling to say hello", "en")?.id).toBe("sam");
  });

  it("matches Spanish keywords with or without accents, and skips routes not serving the language", () => {
    expect(chooseRoute(routes, "Tengo una fuga, necesito una reparacion", "es")?.id).toBe("pm");
    // Vianney's route is Spanish-only: an English "tour" request falls to the default.
    expect(chooseRoute(routes, "Can I book a tour?", "en")?.id).toBe("sam");
    expect(chooseRoute(routes, "Quiero un tour", "es")?.id).toBe("vi");
  });

  it("matches whole words only", () => {
    expect(chooseRoute(routes, "repairman", "en")?.id).toBe("sam");
  });

  it("guesses the caller's language", () => {
    expect(detectLanguage("Hola, necesito ayuda con mi renta")).toBe("es");
    expect(detectLanguage("Hi, I'd like to sell")).toBe("en");
    expect(detectLanguage("   ")).toBeNull();
  });

  it("business hours in the workspace time zone; no hours = always open", () => {
    const hours = parseHours({
      mon: [["09:00", "18:00"]],
      sat: [["10:00", "14:00"]],
      bad: [["x", "y"]],
    });
    // Mon 2026-11-02 17:00Z = 9:00 PST (open); 02:30Z Tue = 18:30 Mon PST (closed).
    expect(isOpen(hours, "America/Los_Angeles", new Date("2026-11-02T17:00:00Z"))).toBe(true);
    expect(isOpen(hours, "America/Los_Angeles", new Date("2026-11-03T02:30:00Z"))).toBe(false);
    // Sunday: closed.
    expect(isOpen(hours, "America/Los_Angeles", new Date("2026-11-01T20:00:00Z"))).toBe(false);
    expect(isOpen({}, "America/Los_Angeles", new Date())).toBe(true);
    expect(parseHours({ tue: [["18:00", "09:00"]] })).toEqual({});
  });
});

describe("Twilio", () => {
  // Twilio's documented example (independently re-computed with Python's hmac).
  const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
  const params = {
    CallSid: "CA1234567890ABCDE",
    Caller: "+12349013030",
    Digits: "1234",
    From: "+12349013030",
    To: "+18005551212",
  };

  it("computes the request signature exactly like Twilio", () => {
    expect(twilioSignature("12345", url, params)).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
  });

  it("verifies against any candidate URL and rejects tampering", () => {
    const sig = "0/KCTR6DLpKmkAf8muzZqo1nDgQ=";
    expect(verifyTwilio("12345", sig, ["http://internal/x", url], params)).toBe(true);
    expect(verifyTwilio("12345", sig, [url], { ...params, Digits: "9999" })).toBe(false);
    expect(verifyTwilio("wrong", sig, [url], params)).toBe(false);
    expect(verifyTwilio("12345", null, [url], params)).toBe(false);
  });

  it("builds escaped TwiML for ringing, the AI hand-off and voicemail", () => {
    const dial = dialTwiml("+16195550100", 15, "/api/x?a=1&b=2", "+16195550000");
    expect(dial).toContain(
      '<Dial timeout="15" action="/api/x?a=1&amp;b=2" method="POST" callerId="+16195550000">',
    );
    expect(dial).toContain("<Number>+16195550100</Number>");
    expect(sipTwiml("sip:agent@sip.example.com", "/after")).toContain(
      "<Sip>sip:agent@sip.example.com</Sip>",
    );
    const vm = voicemailTwiml("Hi <there> & welcome", "Hola", "/vm");
    expect(vm).toContain('<Say language="en-US">Hi &lt;there&gt; &amp; welcome</Say>');
    expect(vm).toContain('<Say language="es-MX">Hola</Say>');
    expect(vm).toContain('<Record maxLength="120" playBeep="true" action="/vm" method="POST"/>');
  });

  it("maps dial and call statuses", () => {
    expect(dialAnswered("completed")).toBe(true);
    expect(dialAnswered("no-answer")).toBe(false);
    expect(callStatusOutcome("no-answer")).toBe("missed");
    expect(callStatusOutcome("busy")).toBe("missed");
    expect(callStatusOutcome("completed")).toBeNull();
  });
});

describe("ElevenLabs post-call webhook", () => {
  const body = '{"type":"x"}';

  it("verifies the t=,v0= signature (independently computed) and rejects stale or wrong ones", () => {
    const sig = "2cbd6f568797b7d07fda98ce544ff6936db7dc19292dd76f2cb684ef3e9ee3d9";
    expect(elevenLabsSignature("wsec_test", "1730500000", body)).toBe(sig);
    const at = new Date(1730500000 * 1000 + 60_000);
    expect(verifyElevenLabs("wsec_test", `t=1730500000,v0=${sig}`, body, at)).toBe(true);
    expect(verifyElevenLabs("wsec_test", `t=1730500000,v0=${sig}`, body + " ", at)).toBe(false);
    expect(
      verifyElevenLabs(
        "wsec_test",
        `t=1730500000,v0=${sig}`,
        body,
        new Date(1730500000 * 1000 + 3600_000),
      ),
    ).toBe(false);
    expect(verifyElevenLabs("wsec_test", null, body, at)).toBe(false);
  });

  it("maps a phone call to a Twilio-keyed call with transcript, summary, name and language", () => {
    const parsed = parsePostCall({
      type: "post_call_transcription",
      data: {
        conversation_id: "conv_1",
        transcript: [
          { role: "agent", message: "Hola, gracias por llamar", time_in_call_secs: 0 },
          { role: "user", message: "Tengo una fuga en el baño", time_in_call_secs: 4 },
          { role: "user", message: "", time_in_call_secs: 6 },
        ],
        metadata: {
          start_time_unix_secs: 1730500000,
          call_duration_secs: 75,
          main_language: "es",
          phone_call: {
            external_number: "+16195550199",
            agent_number: "+16195550000",
            call_sid: "CA-1",
          },
        },
        analysis: {
          transcript_summary: "Tenant reports a leak in the bathroom.",
          data_collection_results: { caller_name: { value: "Pat Tenant" } },
        },
      },
    });
    expect(parsed).toMatchObject({
      provider: "twilio",
      providerCallId: "CA-1",
      fromNumber: "+16195550199",
      durationSecs: 75,
      summary: "Tenant reports a leak in the bathroom.",
      callerName: "Pat Tenant",
      language: "es",
      callerText: "Tengo una fuga en el baño",
      startedAt: "2024-11-01T22:26:40.000Z",
    });
    expect(parsed?.transcript).toHaveLength(2);
    expect(parsed?.transcript[1]).toEqual({
      role: "caller",
      text: "Tengo una fuga en el baño",
      at_secs: 4,
    });
  });

  it("keys web calls by conversation id, and ignores other events", () => {
    expect(
      parsePostCall({ type: "post_call_transcription", data: { conversation_id: "conv_2" } }),
    ).toMatchObject({
      provider: "elevenlabs",
      providerCallId: "conv_2",
      transcript: [],
      summary: null,
    });
    expect(parsePostCall({ type: "post_call_audio", data: { conversation_id: "x" } })).toBeNull();
    expect(parsePostCall(null)).toBeNull();
  });
});

describe("receptionistConfig", () => {
  it("is Not connected without Sam's keys, and only accepts a SIP address for the AI", () => {
    const c = receptionistConfig({});
    expect(c.twilio.connected).toBe(false);
    expect(c.elevenlabs.connected).toBe(false);
    expect(c.aiSipUri).toBeNull();
    const on = receptionistConfig({
      TWILIO_AUTH_TOKEN: "tok",
      ELEVENLABS_WEBHOOK_SECRET: "sec",
      RECEPTIONIST_AI_SIP_URI: "sip:agent@sip.example.com",
    });
    expect(on.twilio.connected && on.elevenlabs.connected).toBe(true);
    expect(on.aiSipUri).toBe("sip:agent@sip.example.com");
    expect(receptionistConfig({ RECEPTIONIST_AI_SIP_URI: "https://evil" }).aiSipUri).toBeNull();
  });
});
