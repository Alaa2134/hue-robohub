#!/usr/bin/env node
/**
 * BuildX Lab's Arduino compiler: GCC and binutils for AVR built for WebAssembly
 * (@horang-corp/avr-gcc-wasm, GPLv3 — see public/lab/NOTICE.txt) served from our own origin and
 * run in the visitor's browser, so sketches compile without a server.
 *
 * Writes public/lab/toolchain/ (git-ignored):
 *   <tool>.<hash>.mjs        the Emscripten loaders, unchanged
 *   <tool>.<hash>.wasm.gz    the compilers, gzipped (the page inflates them with DecompressionStream)
 *   sysroot.<hash>.pack.gz   headers, Arduino core/library objects, avr-libc and libgcc in one file:
 *                            u32 index length, JSON [[path, size], …], then the files back to back
 *   toolchain.json           names of the above, so a new build never mixes old and new files
 *
 * Only the headers an ATmega328P build can open are packed: avr-libc ships an io*.h for every AVR
 * chip (most of its 29 MB); a probe build that includes every header records which ones it reads.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const pkg = path.dirname(require.resolve("@horang-corp/avr-gcc-wasm/package.json"));
const out = path.join(root, "public/lab/toolchain");
const version = JSON.parse(readFileSync(path.join(pkg, "package.json"), "utf8")).version;
const stamp = path.join(out, "toolchain.json");
const SELF = createHash("sha256").update(readFileSync(import.meta.filename)).digest("hex").slice(0, 8);

if (existsSync(stamp)) {
  const prev = JSON.parse(readFileSync(stamp, "utf8"));
  if (prev.version === version && prev.script === SELF && Object.values(prev.files).every((f) => existsSync(path.join(out, f)))) {
    console.log("[lab-toolchain] up to date");
    process.exit(0);
  }
}

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
const assets = path.join(pkg, "assets");
const fsRoot = path.join(assets, "fs");
const headers = walk(fsRoot).map((f) => "/" + path.relative(fsRoot, f).split(path.sep).join("/"));

// Probe: every avr-libc header and every library header in one translation unit.
const probe = [
  "#include <Arduino.h>",
  ...headers.filter((h) => /^\/sysroot\/avr\/include\/(?:[^/]+|util\/[^/]+)\.h$/.test(h) && !/\/(?:assert|compat|delay_basic)\.h$/.test(h)).map((h) => `#include <${h.replace("/sysroot/avr/include/", "")}>`),
  "#include <Wire.h>",
  "#include <SPI.h>",
  "#include <Servo.h>",
  "#include <DHT.h>",
  "#include <Adafruit_GFX.h>",
  "#include <Adafruit_SSD1306.h>",
  "#include <Adafruit_BMP085.h>",
  "#include <VL53L0X.h>",
  "#include <Firmata.h>",
  "void setup() {}",
  "void loop() {}",
].join("\n");

const CC1_FLAGS = (incs) => [
  "-quiet", "-imultilib", "avr5", "-D__AVR_ATmega328P__", "-D__AVR_DEVICE_NAME__=atmega328p", "-DF_CPU=16000000L",
  "-DARDUINO=10819", "-DARDUINO_AVR_UNO", "-DARDUINO_ARCH_AVR", "-isystem", "/sysroot/gcc/include", "-isystem", "/sysroot/avr/include",
  ...incs.flatMap((i) => ["-I", i]),
];
const INCLUDES = [
  "/arduino/core", "/arduino/variant", "/arduino/libraries/Wire/src", "/arduino/libraries/SPI/src", "/libraries/Servo/src",
  "/libraries/DHT_sensor_library", "/libraries/Adafruit_Unified_Sensor", "/libraries/Adafruit_GFX_Library", "/libraries/Adafruit_SSD1306",
  "/libraries/Adafruit_BusIO", "/libraries/Adafruit_BMP085_Library", "/libraries/VL53L0X", "/libraries/Firmata",
];

const opened = new Set();
{
  const factory = (await import(pathToFileURL(path.join(pkg, "tools/cc1plus.mjs")).href)).default;
  const errs = [];
  const mod = await factory({ noInitialRun: true, print() {}, printErr: (l) => l && errs.push(l), wasmBinary: readFileSync(path.join(pkg, "tools/cc1plus.wasm")) });
  const mk = (p, data) => {
    let c = "";
    for (const part of p.split("/").filter(Boolean).slice(0, -1)) {
      c += "/" + part;
      try { mod.FS.mkdir(c); } catch {}
    }
    mod.FS.writeFile(p, data);
  };
  for (const h of headers) mk(h, readFileSync(path.join(fsRoot, h)));
  mk("/build/probe.cpp", probe);
  const open = mod.FS.open;
  mod.FS.open = (p, ...a) => {
    if (typeof p === "string") opened.add(path.posix.normalize(p));
    return open.call(mod.FS, p, ...a);
  };
  try {
    mod.callMain([...CC1_FLAGS(INCLUDES), "/build/probe.cpp", "-mmcu=avr5", "-Os", "-std=gnu++11", "-fpermissive", "-fno-exceptions", "-fno-rtti", "-o", "/build/probe.s"]);
  } catch (e) {
    if (e?.status) throw new Error(`probe build failed:\n${errs.join("\n")}`);
  }
  if (!mod.FS.analyzePath("/build/probe.s").exists) throw new Error(`probe build produced nothing:\n${errs.join("\n")}`);
}

// Chip headers nobody opened are dropped; everything else stays (a sketch may include any of it).
const chip = /^\/sysroot\/avr\/include\/avr\/io[a-z0-9]+\.h$/;
const keep = headers.filter((h) => !chip.test(h) || opened.has(h) || h === "/sysroot/avr/include/avr/io.h");
if (!keep.includes("/sysroot/avr/include/avr/iom328p.h")) throw new Error("probe never opened iom328p.h");

/** Global and weak symbols an ELF32 object defines (for the archive index). */
function definedSymbols(o) {
  const dv = new DataView(o.buffer, o.byteOffset, o.byteLength);
  const shoff = dv.getUint32(32, true);
  const size = dv.getUint16(46, true);
  const count = dv.getUint16(48, true);
  const sec = (i) => ({ type: dv.getUint32(shoff + i * size + 4, true), offset: dv.getUint32(shoff + i * size + 16, true), size: dv.getUint32(shoff + i * size + 20, true), link: dv.getUint32(shoff + i * size + 24, true) });
  const out = [];
  for (let i = 0; i < count; i++) {
    const s = sec(i);
    if (s.type !== 2) continue; // SHT_SYMTAB
    const str = sec(s.link);
    for (let at = s.offset + 16; at < s.offset + s.size; at += 16) {
      const bind = o[at + 12] >> 4;
      const shndx = dv.getUint16(at + 14, true);
      if ((bind === 1 || bind === 2) && shndx !== 0) {
        let n = str.offset + dv.getUint32(at, true);
        let name = "";
        while (o[n]) name += String.fromCharCode(o[n++]);
        out.push(name);
      }
    }
  }
  return out;
}

/**
 * The Arduino core and libraries as one static library (GNU ar with a symbol index), so the linker
 * pulls in only what the sketch uses — like the Arduino IDE's core.a. Linking the objects directly
 * would always include e.g. the Serial object (and its RAM buffers).
 */
function archive(members) {
  const pad = (s, n) => Buffer.from(s.padEnd(n, " "));
  const header = (name, size) => Buffer.concat([pad(name, 16), pad("0", 12), pad("0", 6), pad("0", 6), pad("644", 8), pad(String(size), 10), Buffer.from("`\n")]);
  const syms = members.map((m) => definedSymbols(m.data));
  const names = Buffer.from(syms.flat().map((s) => s + "\0").join(""));
  const n = syms.flat().length;
  const indexSize = 4 + 4 * n + names.length;
  let at = 8 + 60 + indexSize + (indexSize % 2);
  const offsets = members.map((m) => {
    const o = at;
    at += 60 + m.data.length + (m.data.length % 2);
    return o;
  });
  const index = Buffer.alloc(4 + 4 * n);
  index.writeUInt32BE(n, 0);
  let k = 0;
  syms.forEach((list, i) => list.forEach(() => index.writeUInt32BE(offsets[i], 4 + 4 * k++)));
  const parts = [Buffer.from("!<arch>\n"), header("/", indexSize), index, names];
  if (indexSize % 2) parts.push(Buffer.from("\n"));
  members.forEach((m, i) => {
    parts.push(header(`m${i}.o/`, m.data.length), m.data);
    if (m.data.length % 2) parts.push(Buffer.from("\n"));
  });
  return Buffer.concat(parts);
}

const manifest = JSON.parse(readFileSync(path.join(assets, "manifest.json"), "utf8"));
const objects = readdirSync(path.join(assets, "objects")).sort();
const libarduino = archive(objects.map((f) => ({ data: readFileSync(path.join(assets, "objects", f)) })));
const binaries = [...manifest.libs, "/ldscripts/avr5.xn"];
const entries = [
  ...keep.map((h) => [h, readFileSync(path.join(fsRoot, h))]),
  ...binaries.map((p) => [p, readFileSync(path.join(assets, p))]),
  ["/libs/libarduino.a", libarduino],
];
const index = Buffer.from(JSON.stringify(entries.map(([p, b]) => [p, b.length])));
const len = Buffer.alloc(4);
len.writeUInt32LE(index.length);
const pack = gzipSync(Buffer.concat([len, index, ...entries.map(([, b]) => b)]), { level: 9 });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const hash = (b) => createHash("sha256").update(b).digest("hex").slice(0, 10);
const files = {};
const put = (key, name, ext, data) => {
  files[key] = `${name}.${hash(data)}${ext}`;
  writeFileSync(path.join(out, files[key]), data);
};
put("sysroot", "sysroot", ".pack.gz", pack);
for (const t of ["cc1plus", "avr-as", "avr-ld", "avr-objcopy"]) {
  put(`${t}.mjs`, t, ".mjs", readFileSync(path.join(pkg, `tools/${t}.mjs`)));
  put(`${t}.wasm`, t, ".wasm.gz", gzipSync(readFileSync(path.join(pkg, `tools/${t}.wasm`)), { level: 9 }));
}
writeFileSync(stamp, JSON.stringify({ version, script: SELF, includes: INCLUDES, files }, null, 1));
const total = Object.values(files).reduce((n, f) => n + statSync(path.join(out, f)).size, 0);
console.log(`[lab-toolchain] ${keep.length}/${headers.length} headers, ${objects.length} core/library objects → public/lab/toolchain (${(total / 1048576).toFixed(1)} MB)`);
