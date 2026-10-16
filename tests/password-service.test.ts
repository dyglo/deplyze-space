import { describe, it, expect } from "vitest";
import { pbkdf2Sync } from "node:crypto";
import { derivePasswordRequest } from "../lib/password-kdf";

const secret = "local-test-only-service-secret";
const salt = "0123456789abcdef0123456789abcdef";
const request = (body: string, token = secret, origin?: string) =>
  new Request("https://test.invalid/api/internal/password", {
    method: "POST",
    body,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(origin ? { Origin: origin } : {}),
    },
  });
describe("private Node password derivation service", () => {
  it("matches existing PBKDF2-600000 records, including Unicode passwords", async () => {
    const password = "unicode 密码 🌍";
    const response = await derivePasswordRequest(
      request(JSON.stringify({ password, salt })),
      secret,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      hash: pbkdf2Sync(password, salt, 600000, 32, "sha256").toString("hex"),
    });
  });
  it("rejects unauthenticated/browser callers before parsing or computing", async () => {
    expect(
      (await derivePasswordRequest(request("not JSON", "wrong"), secret))
        .status,
    ).toBe(401);
    expect(
      (
        await derivePasswordRequest(
          request("not JSON", secret, "https://browser.invalid"),
          secret,
        )
      ).status,
    ).toBe(401);
    expect(
      (await derivePasswordRequest(request("not JSON"), undefined)).status,
    ).toBe(503);
  });
  it("bounds authenticated payloads and rejects arbitrary hash parameters", async () => {
    expect(
      (await derivePasswordRequest(request("x".repeat(4097)), secret)).status,
    ).toBe(413);
    for (const body of [
      "not JSON",
      JSON.stringify({ password: "p", salt: "short" }),
      JSON.stringify({ password: "x".repeat(129), salt }),
    ])
      expect((await derivePasswordRequest(request(body), secret)).status).toBe(
        400,
      );
  });
});
