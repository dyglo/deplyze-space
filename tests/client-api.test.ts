import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});
async function client() {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test");
  return import("../lib/transfers");
}
describe("transfer API failures", () => {
  it("maps browser network failures to an actionable retry error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const { api } = await client();
    await expect(api("/transfers")).rejects.toThrow(
      "Check your connection and retry",
    );
  });
  it("handles platform HTML failures without exposing a JSON parser error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>platform error</html>", { status: 503 }),
        ),
    );
    const { api } = await client();
    await expect(api("/transfers")).rejects.toThrow("temporarily unavailable");
  });
  it("preserves user cancellation and API validation errors", async () => {
    const aborted = new DOMException("paused", "AbortError");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(aborted)
        .mockResolvedValueOnce(
          Response.json({ error: "Transfer exceeds 2 GB" }, { status: 400 }),
        ),
    );
    const { api } = await client();
    const control = new AbortController();
    control.abort();
    await expect(api("/transfers", { signal: control.signal })).rejects.toBe(
      aborted,
    );
    await expect(api("/transfers")).rejects.toMatchObject({
      message: "Transfer exceeds 2 GB",
      status: 400,
    });
  });
});
