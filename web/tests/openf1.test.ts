import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenF1LockedError, openf1 } from "@/lib/openf1";

const respond = (status: number, body: unknown = []) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("openf1 client", () => {
  it("reports a live-session lockout when no account is configured", async () => {
    vi.stubGlobal("fetch", respond(401, { detail: "live session" }));
    await expect(openf1("sessions", { session_key: 1 })).rejects.toBeInstanceOf(OpenF1LockedError);
  });

  it("signs in and sends a bearer token when an account is configured", async () => {
    vi.stubEnv("OPENF1_USERNAME", "u");
    vi.stubEnv("OPENF1_PASSWORD", "p");
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/token")
        ? new Response(JSON.stringify({ access_token: "abc", expires_in: "3600" }))
        : new Response(JSON.stringify([{ session_key: 1 }])));
    vi.stubGlobal("fetch", fetch);
    expect(await openf1("sessions", { session_key: 1 })).toEqual([{ session_key: 1 }]);
    const [, init] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc");
  });
});
