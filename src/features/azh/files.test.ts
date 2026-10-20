import { describe, expect, it } from "vitest";

import { checkFile, FILE_PATH_RE, formatBytes, sanitizeFileName } from "./files";

describe("file uploads", () => {
  it("allows photos and documents up to 10 MB", () => {
    expect(checkFile({ name: "a.jpg", type: "image/jpeg", size: 1000 })).toEqual({
      ok: true,
      kind: "photo",
    });
    expect(
      checkFile({ name: "plan.pdf", type: "application/pdf", size: 10 * 1024 * 1024 }),
    ).toEqual({
      ok: true,
      kind: "document",
    });
  });

  it("rejects other types, oversize and empty files", () => {
    expect(checkFile({ name: "x.exe", type: "application/x-msdownload", size: 10 }).ok).toBe(false);
    expect(checkFile({ name: "x.svg", type: "image/svg+xml", size: 10 }).ok).toBe(false);
    expect(
      checkFile({ name: "big.pdf", type: "application/pdf", size: 10 * 1024 * 1024 + 1 }).ok,
    ).toBe(false);
    expect(checkFile({ name: "empty.txt", type: "text/plain", size: 0 }).ok).toBe(false);
  });

  it("sanitizes names for storage paths", () => {
    expect(sanitizeFileName("Kitchen Plan (v2).PDF")).toBe("Kitchen-Plan-v2.pdf");
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\me\\.env")).toBe("env");
    expect(sanitizeFileName("Baño foto.jpeg")).toBe("Bano-foto.jpeg");
    expect(sanitizeFileName("   ")).toBe("file");
    const p = `63f80c72-3939-45af-af4d-a611c7f9525a/c4438938-b7ab-4800-a4ea-4623425be092/${sanitizeFileName("a b.png")}`;
    expect(FILE_PATH_RE.test(p)).toBe(true);
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3.5 * 1024 * 1024)).toBe("3.5 MB");
  });
});
