import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { SECRET_FOLDER } from "../secret-folder.ts";
import { fetchImage, readSourceImage, sniffImage, SourceRefusal } from "./sources.ts";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f7a43b0000000049454e44ae426082", "hex");
const base = mkdtempSync(join(tmpdir(), "corso-design-sources-"));
const work = join(base, "work");
const attachments = join(base, "attachments");
const elsewhere = join(base, "elsewhere");
for (const folder of [work, attachments, elsewhere, join(work, "photos"), join(work, SECRET_FOLDER)]) mkdirSync(folder, { recursive: true });
writeFileSync(join(work, "photos", "front.png"), PNG);
writeFileSync(join(work, "notes.txt"), "not an image");
writeFileSync(join(work, SECRET_FOLDER, "key.png"), PNG);
writeFileSync(join(attachments, "upload-1.jpg"), PNG);
writeFileSync(join(elsewhere, "private.png"), PNG);
symlinkSync(join(elsewhere, "private.png"), join(work, "linked.png"));
const where = { roots: [work, attachments] };
afterAll(() => rmSync(base, { recursive: true, force: true }));

const refusal = (source: string) => readSourceImage(source, where).then(() => "read", (error: unknown) => {
  if (!(error instanceof SourceRefusal)) throw error;
  return error.message;
});

describe("design image sources", () => {
  it("read a file in the working folder, by absolute or relative path, and a person's attachment", async () => {
    await expect(readSourceImage(join(work, "photos", "front.png"), where)).resolves.toEqual({ mime: "image/png", bytes: PNG });
    await expect(readSourceImage("photos/front.png", where)).resolves.toEqual({ mime: "image/png", bytes: PNG });
    await expect(readSourceImage(join(attachments, "upload-1.jpg"), where)).resolves.toMatchObject({ mime: "image/png" });
  });

  it("refuse ../ even when it would land inside the folder", async () => {
    expect(await refusal("photos/../photos/front.png")).toMatch(/climbs out with/);
    expect(await refusal(`${work}/../elsewhere/private.png`)).toMatch(/climbs out with/);
  });

  it("refuse a file outside the bot's folders and attachments, a link pointing out included", async () => {
    expect(await refusal(join(elsewhere, "private.png"))).toMatch(/not in your working folder or among the person's attachments/);
    expect(await refusal("linked.png")).toMatch(/not in your working folder/);
    expect(await refusal("/etc/hosts")).toMatch(/not in your working folder/);
  });

  it("refuse the secret folder, a file that is not an image, and one that is missing", async () => {
    expect(await refusal(join(work, SECRET_FOLDER, "key.png"))).toMatch(/holds a secret/);
    expect(await refusal("notes.txt")).toMatch(/not a PNG, JPEG, WebP or GIF/);
    expect(await refusal("photos/missing.png")).toMatch(/Nothing was found/);
  });

  it("refuse http:, file: and data: addresses", async () => {
    expect(await refusal("http://example.com/a.jpg")).toMatch(/is not https/);
    expect(await refusal(`file://${join(work, "photos", "front.png")}`)).toMatch(/neither a file path nor an https address/);
    expect(await refusal("data:image/png;base64,AAAA")).toMatch(/neither a file path nor an https address/);
  });

  it("never fetch from this computer or its network", async () => {
    await expect(fetchImage("https://127.0.0.1/a.png")).rejects.toThrow(/not on the public internet/);
    await expect(fetchImage("https://10.0.0.8/a.png")).rejects.toThrow(/not on the public internet/);
    await expect(fetchImage("https://[::1]/a.png")).rejects.toThrow(/not on the public internet/);
    await expect(fetchImage("https://169.254.169.254/latest")).rejects.toThrow(/not on the public internet/);
    await expect(fetchImage("https://localhost/a.png")).rejects.toThrow(/not on the public internet/);
    await expect(fetchImage("https://user:pw@example.com/a.png")).rejects.toThrow(/user name or password/);
  });

  it("know an image by its bytes, not its name", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(Buffer.from("GIF89a..."))).toBe("image/gif");
    expect(sniffImage(Buffer.from("<svg/>"))).toBeNull();
  });
});
