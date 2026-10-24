/**
 * Builds an Arduino Uno/Nano (ATmega328P) sketch to Intel HEX with real GCC: cc1plus → avr-as →
 * avr-ld → avr-objcopy, each a WebAssembly program run on an in-memory file system. Runs the same in
 * the browser's compiler worker and in Node (tests); only how a tool is instantiated differs.
 */
import { FILE_NAME, includesOf, parseDiagnostics, sketchToCpp, type Diagnostic, type SourceFile } from "./sketch";

export type ToolName = "cc1plus" | "avr-as" | "avr-ld" | "avr-objcopy";
type EmFS = { mkdir(p: string): void; writeFile(p: string, d: Uint8Array | string): void; readFile(p: string): Uint8Array; analyzePath(p: string): { exists: boolean } };
export type EmModule = { FS: EmFS; callMain(args: string[]): number | void };
export type EmOptions = { noInitialRun: true; print(s: string): void; printErr(s: string): void };

export interface Toolchain {
  /** A fresh instance of a tool (a program runs once per instance). */
  instantiate(tool: ToolName, opts: EmOptions): Promise<EmModule>;
  /** Headers, core/library objects, avr-libc and the linker script, by absolute path. */
  sysroot: Map<string, Uint8Array>;
  includes: string[];
}

export type BuildResult = {
  ok: boolean;
  hex?: string;
  diagnostics: Diagnostic[];
  log: string[];
  sizes?: { flash: number; ram: number; flashMax: number; ramMax: number };
  ms: number;
  libraries: string[];
};

export const FLASH_MAX = 32256; // 32 KB minus the Optiboot bootloader
export const RAM_MAX = 2048;

/** Libraries a sketch can #include (their code is in libarduino.a; the linker takes what's used). */
export const SUPPORTED_LIBRARIES = ["Servo.h", "Wire.h", "SPI.h", "DHT.h", "DHT_U.h", "Adafruit_Sensor.h", "Adafruit_GFX.h", "Adafruit_SSD1306.h", "Adafruit_BMP085.h", "VL53L0X.h", "Firmata.h"];

const DEFINES = ["-D__AVR_ATmega328P__", "-D__AVR_DEVICE_NAME__=atmega328p", "-DF_CPU=16000000L", "-DARDUINO=10819", "-DARDUINO_AVR_UNO", "-DARDUINO_ARCH_AVR"];

function writeTree(fs: EmFS, path: string, data: Uint8Array | string) {
  let dir = "";
  for (const part of path.split("/").filter(Boolean).slice(0, -1)) {
    dir += "/" + part;
    try {
      fs.mkdir(dir);
    } catch {
      /* exists */
    }
  }
  fs.writeFile(path, data);
}

async function run(tc: Toolchain, tool: ToolName, args: string[], files: [string, Uint8Array | string][], output: string, log: string[]) {
  const mod = await tc.instantiate(tool, { noInitialRun: true, print: (s) => s && log.push(s), printErr: (s) => s && log.push(s) });
  for (const [p, d] of files) writeTree(mod.FS, p, d);
  let status = 0;
  try {
    status = Number(mod.callMain(args) ?? 0);
  } catch (e) {
    const s = (e as { status?: number })?.status;
    if (typeof s === "number") status = s;
    else throw e;
  }
  const made = mod.FS.analyzePath(output).exists;
  return { status, data: status === 0 && made ? mod.FS.readFile(output) : null };
}

/** Flash and RAM use from the ELF's section headers (.text + .data in flash, .data + .bss in RAM). */
export function elfSizes(elf: Uint8Array) {
  const dv = new DataView(elf.buffer, elf.byteOffset, elf.byteLength);
  const shoff = dv.getUint32(32, true);
  const shentsize = dv.getUint16(46, true);
  const shnum = dv.getUint16(48, true);
  const shstrndx = dv.getUint16(50, true);
  const sec = (i: number) => {
    const o = shoff + i * shentsize;
    return { name: dv.getUint32(o, true), size: dv.getUint32(o + 20, true), offset: dv.getUint32(o + 16, true) };
  };
  const strtab = sec(shstrndx);
  const nameOf = (n: number) => {
    let s = "";
    for (let i = strtab.offset + n; elf[i]; i++) s += String.fromCharCode(elf[i]);
    return s;
  };
  const sizes: Record<string, number> = {};
  for (let i = 0; i < shnum; i++) {
    const s = sec(i);
    sizes[nameOf(s.name)] = s.size;
  }
  const data = sizes[".data"] ?? 0;
  return { flash: (sizes[".text"] ?? 0) + data, ram: data + (sizes[".bss"] ?? 0) + (sizes[".noinit"] ?? 0) };
}

/** Compile and link a sketch. `main` names the .ino that comes first (the project's main file). */
export async function buildSketch(tc: Toolchain, files: SourceFile[], main?: string): Promise<BuildResult> {
  const t0 = performance.now();
  const log: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const done = (ok: boolean, extra: Partial<BuildResult> = {}): BuildResult => ({ ok, diagnostics, log, ms: Math.round(performance.now() - t0), libraries: [], ...extra });

  const bad = files.find((f) => !FILE_NAME.test(f.name));
  if (bad) {
    diagnostics.push({ file: bad.name, line: 0, col: 0, severity: "error", message: "File names use letters, numbers, - and _, and end in .ino, .h, .cpp or .c" });
    return done(false);
  }
  const sketch = sketchToCpp(files, main);
  if (sketch == null) {
    diagnostics.push({ file: "", line: 0, col: 0, severity: "error", message: "The sketch needs a .ino file with setup() and loop()." });
    return done(false);
  }

  const includes = includesOf(files);
  const own = new Set(files.map((f) => f.name));
  const known = new Set([...tc.sysroot.keys()].map((p) => p.slice(p.lastIndexOf("/") + 1)));
  const missing = [...includes].filter((h) => !own.has(h) && /\.h$/.test(h) && !h.includes("/") && !known.has(h));
  for (const h of missing)
    diagnostics.push({ file: files.find((f) => f.text.includes(h))?.name ?? "", line: 0, col: 0, severity: "error", message: `Library "${h}" isn't available in BuildX Lab. Available: ${SUPPORTED_LIBRARIES.join(", ")}` });
  if (missing.length) return done(false);

  const libraries = [...includes].filter((h) => SUPPORTED_LIBRARIES.includes(h));
  const headers: [string, Uint8Array][] = [...tc.sysroot].filter(([p]) => !p.startsWith("/libs/") && !p.startsWith("/ldscripts/"));
  const userFiles: [string, string][] = files.map((f) => [`/build/src/${f.name}`, f.text]);
  const units: { name: string; path: string }[] = [{ name: "sketch", path: "/build/sketch.cpp" }];
  for (const f of files) if (/\.(cpp|c)$/.test(f.name)) units.push({ name: f.name.replace(/\W/g, "_"), path: `/build/src/${f.name}` });

  const objects: [string, Uint8Array][] = [];
  for (const u of units) {
    const out: string[] = [];
    const asm = await run(
      tc,
      "cc1plus",
      [
        "-quiet", "-imultilib", "avr5", ...DEFINES,
        "-isystem", "/sysroot/gcc/include", "-isystem", "/sysroot/avr/include",
        "-I", "/build/src", ...tc.includes.flatMap((i) => ["-I", i]),
        u.path, "-mn-flash=1", "-mno-skip-bug", "-dumpbase", `${u.name}.cpp`, "-mmcu=avr5", "-auxbase-strip", `/build/${u.name}.s`,
        "-Os", "-std=gnu++11", "-fpermissive", "-fno-exceptions", "-fno-threadsafe-statics", "-fno-rtti", "-ffunction-sections", "-fdata-sections",
        "-Wall", "-o", `/build/${u.name}.s`,
      ],
      [...headers, ...userFiles, ["/build/sketch.cpp", sketch]],
      `/build/${u.name}.s`,
      out,
    );
    const parsed = parseDiagnostics(out);
    diagnostics.push(...parsed.diagnostics);
    log.push(...parsed.rest);
    if (!asm.data || diagnostics.some((d) => d.severity === "error")) return done(false);
    const obj = await run(tc, "avr-as", ["-mmcu=atmega328p", "-o", `/build/${u.name}.o`, `/build/${u.name}.s`], [[`/build/${u.name}.s`, asm.data]], `/build/${u.name}.o`, log);
    if (!obj.data) return done(false, { log: [...log, "assembler failed"] });
    objects.push([`/build/${u.name}.o`, obj.data]);
  }

  const ldOut: string[] = [];
  const binaries = [...tc.sysroot].filter(([p]) => p.startsWith("/libs/") || p.startsWith("/ldscripts/"));
  const elf = await run(
    tc,
    "avr-ld",
    ["-m", "avr5", "-Tdata=0x800100", "--gc-sections", "-o", "/build/sketch.elf", "/libs/crtatmega328p.o", ...objects.map(([p]) => p), "-L/libs", "--start-group", "-larduino", "-lm", "-lc", "-lgcc", "--end-group"],
    [...objects, ...binaries],
    "/build/sketch.elf",
    ldOut,
  );
  const ld = parseDiagnostics(ldOut);
  diagnostics.push(...ld.diagnostics);
  if (!elf.data) {
    log.push(...ld.rest);
    if (!diagnostics.some((d) => d.severity === "error")) diagnostics.push({ file: "", line: 0, col: 0, severity: "error", message: ld.rest.slice(-3).join(" ") || "Linking failed." });
    return done(false);
  }
  const sizes = { ...elfSizes(elf.data), flashMax: FLASH_MAX, ramMax: RAM_MAX };
  if (sizes.flash > FLASH_MAX) {
    diagnostics.push({ file: "", line: 0, col: 0, severity: "error", message: `The program uses ${sizes.flash} bytes of flash; the board has ${FLASH_MAX}.` });
    return done(false, { sizes });
  }
  if (sizes.ram > RAM_MAX) diagnostics.push({ file: "", line: 0, col: 0, severity: "warning", message: `Global variables use ${sizes.ram} of ${RAM_MAX} bytes of RAM: the program will likely crash.` });
  else if (sizes.ram > RAM_MAX * 0.75) diagnostics.push({ file: "", line: 0, col: 0, severity: "warning", message: `Global variables use ${sizes.ram} of ${RAM_MAX} bytes of RAM; little is left for the stack.` });
  const hex = await run(tc, "avr-objcopy", ["-O", "ihex", "-R", ".eeprom", "/build/sketch.elf", "/build/sketch.hex"], [["/build/sketch.elf", elf.data]], "/build/sketch.hex", log);
  if (!hex.data) return done(false);
  return done(true, { hex: new TextDecoder().decode(hex.data), sizes, libraries });
}

/** Reads the packed sysroot (u32 index length, JSON [[path, size], …], then the files). */
export function unpackSysroot(buf: Uint8Array): Map<string, Uint8Array> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = dv.getUint32(0, true);
  const index = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + n))) as [string, number][];
  const map = new Map<string, Uint8Array>();
  let at = 4 + n;
  for (const [p, size] of index) {
    map.set(p, buf.subarray(at, at + size));
    at += size;
  }
  return map;
}
