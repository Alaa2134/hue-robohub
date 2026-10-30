import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crc32, zipStore } from "./zip-store";

describe("zipStore", () => {
  it("crc32 matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
  });

  it("makes a ZIP that unzip reads back, Arabic names included", async () => {
    const blob = zipStore([
      { name: "صورة-1.webp", data: new Uint8Array([1, 2, 3]) },
      { name: "b.txt", data: new TextEncoder().encode("hello") },
    ]);
    const dir = mkdtempSync(join(tmpdir(), "zip-"));
    const file = join(dir, "t.zip");
    writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
    const py = `import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint("|".join(f"{i.filename}:{len(z.read(i))}" for i in z.infolist()))`;
    expect(execFileSync("python3", ["-c", py, file]).toString().trim()).toBe("صورة-1.webp:3|b.txt:5");
  });
});
