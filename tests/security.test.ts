import { describe, it, expect } from "vitest";
import { pbkdf2Sync } from "node:crypto";
import {
  active,
  equal,
  hash,
  mac,
  passwordHash,
  passwordMatches,
  transferSchema,
  MAX_BYTES,
  disposition,
} from "../worker/src/security";
describe("transfer security", () => {
  it("enforces aggregate size and allowed expiration", () => {
    expect(
      transferSchema.safeParse({
        files: [
          { name: "a", size: MAX_BYTES },
          { name: "b", size: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      transferSchema.safeParse({ files: [{ name: "a", size: 0 }], days: 2 })
        .success,
    ).toBe(false);
  });
  it("accepts empty files and Unicode while rejecting path traversal and header controls", () => {
    for (const name of ["../x", "a\\b", "a\r\nb", "..", ""])
      expect(
        transferSchema.safeParse({ files: [{ name, size: 1 }] }).success,
      ).toBe(false);
    expect(
      transferSchema.safeParse({ files: [{ name: "报告 🌍.html", size: 0 }] })
        .success,
    ).toBe(true);
  });
  it("makes expiration immediate, including equality", () => {
    expect(active({ status: "ready", expires_at: 100 }, 100)).toBe(false);
    expect(active({ status: "pending", expires_at: 200 }, 100)).toBe(false);
    expect(active({ status: "ready", expires_at: 101 }, 100)).toBe(true);
  });
  it("hashes with unique salts and verifies passwords", async () => {
    const a = await passwordHash("a long password"),
      b = await passwordHash("a long password");
    expect(a).not.toBe(b);
    expect(await passwordMatches("a long password", a)).toBe(true);
    expect(await passwordMatches("wrong password", a)).toBe(false);
    const salt = "0123456789abcdef0123456789abcdef";
    expect(await passwordHash("unicode 密码 🌍", salt)).toBe(
      `${salt}:${pbkdf2Sync("unicode 密码 🌍", salt, 600000, 32, "sha256").toString("hex")}`,
    );
  });
  it("binds signatures to the resource and compares full values", async () => {
    expect(await mac("secret", "file1")).not.toBe(await mac("secret", "file2"));
    expect(equal("abc", "abcd")).toBe(false);
    expect(equal("abc", "abc")).toBe(true);
    expect(await hash("token")).not.toBe("token");
  });
  it("forces attachments and encodes malicious names", () => {
    expect(disposition('a";x=1.html')).toBe(
      "attachment; filename=\"download\"; filename*=UTF-8''a%22%3Bx%3D1.html",
    );
  });
});
