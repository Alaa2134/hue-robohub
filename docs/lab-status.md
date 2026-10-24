# BuildX Lab — implementation status

What `/lab` really does today, so nothing unfinished is presented as finished.
Keep this file updated with every Lab change.

**Legend**
- ✅ **Working:** real, tested end to end.
- 🟡 **Partial:** works, with the stated limits.
- 👁 **Visual only:** drawn, not simulated.
- ⛔ **Missing:** not built. The app shows an honest "coming" page, never a demo.

## Platform

| Area | Status | Notes |
|---|---|---|
| App shell, AR/EN, RTL, reduce-motion | ✅ | `src/lab/app.tsx`, `src/lab/i18n.tsx` |
| Deep links on the static host | ✅ | 404 → `/lab/?r=…` → clean URL restored |
| Student / staff / guest identity | ✅ | Student token, staff Supabase session, guest projects in localStorage |
| Projects: create, open, rename, autosave, conflict detection | ✅ | Optimistic revisions; a newer save made elsewhere is never overwritten |
| Save status with last-saved time; project cards with favourite, duplicate, trash (confirmed in-app) and restore | ✅ | |
| Version history and restore | ✅ | Last 50 versions per project, kept server-side |
| Server-side permissions | ✅ | RLS on with no policies; every access goes through `SECURITY DEFINER` RPCs that check the caller |
| Dashboard achievements | ✅ | Computed from real activity only |
| Gallery (public projects) | 🟡 | Listing and clone; comments, likes, reports and moderation are not built |

## Circuit workspace (`/lab/circuits/:id`)

| Feature | Status | Notes |
|---|---|---|
| Pan, zoom around the cursor, pinch / trackpad, fit, zoom % | ✅ | |
| Grid show/hide, snap on/off, grid 1.27 / 2.54 / 5.08 mm, background | ✅ | Saved with the project |
| Rulers (mm), cursor coordinates, minimap | ✅ | Click or drag the minimap to pan |
| Marquee selection, select all, multi-move | ✅ | |
| Rotate CW / CCW, duplicate, copy / cut / paste | ✅ | Copy uses the system clipboard as JSON (works across tabs); falls back to an internal copy |
| Delete with confirmation | ✅ | Asks when 3 or more parts are deleted; locked parts are skipped |
| Undo / redo | ✅ | Drags merge into one step |
| Align left / centre / top / middle, distribute | ✅ | |
| Lock, bring to front / send to back, labels on parts and wires | ✅ | |
| Right-click / long-press context menu | ✅ | Part, wire and canvas menus, keyboard navigable |
| Hover tooltips | ✅ | Pin role, connections and live volts on board pins; part name and support level |
| Net highlight, junction dots | ✅ | |
| Wiring: right-angle or free routing, bends, endpoint re-attach, colours, Esc to cancel | ✅ | |
| Pin-type colours | ✅ | Power, ground, digital, PWM, analog, I²C, UART, SPI |
| Pinout and documentation sheets | ✅ | Generated from the part catalog |
| Wiring checks with why and how to fix; click to select | ✅ | See "Diagnostics" below |
| Realistic 2D parts (rendered from the 3D models) | ✅ | Falls back to vector art without WebGL |
| 3D bench view | ✅ | On-demand rendering, lighter on software GL |
| Wire thickness control | ⛔ | |
| Editing individual wire segments (beyond adding and moving bends) | 🟡 | |

### Diagnostics

**Before running**, from the wiring alone (`src/lab/sim/diagnostics.ts`):
- unconnected legs
- broken wires
- a rail shorted to ground
- over-voltage on board pins (VIN up to 12 V)
- reversed LED or electrolytic capacitor
- an LED with no series resistor
- board pins wired together
- a floating button input
- duplicate wires

The floating-input check accepts any `INPUT_PULLUP` in the sketch; it doesn't work out which pin the pull-up is for.

**While running**, from solved currents:
- LED over-current
- pin over-current (> 40 mA)
- shorts on 5 V, 3.3 V and batteries

## Compile and simulate

| Feature | Status | Notes |
|---|---|---|
| Real avr-gcc compile in the browser (Web Worker, WASM) | ✅ | Arduino core linked from a real `libarduino.a`; sizes reported |
| Error locations mapped to sketch lines | ✅ | |
| ATmega328P emulation (avr8js): GPIO, timers 0–2 / PWM, ADC, USART | ✅ | Runs in a worker, about real-time |
| Circuit solver (DC MNA) | ✅ | Resistors, LEDs, diodes, BJTs, MOSFETs, sources |
| Capacitor charging over time | ⛔ | DC solver: a capacitor is an open circuit |
| Servo (pulse width → angle), HC-SR04 (echo timing), buzzer (frequency) | ✅ | |
| Serial monitor | ✅ | Sim-time stamps per line, copy, .txt export, history (↑/↓), line endings, autoscroll, baud read from `Serial.begin()`; the USART runs at whatever the program sets, so baud mismatches aren't modelled |
| Simulation speed ×0.1–×4, measured speed, sim time, error count | ✅ | The device may not reach ×4; the measured speed is shown |
| Step-by-step execution, breakpoints, CPU register view | ⛔ | |
| Oscilloscope on board pins | ✅ | 4 channels; 0.1 ms–0.5 s/div; 0.5–2 V/div; rising/falling trigger with level; hold; time cursors with Δt and 1/Δt; frequency, duty, min/max/avg; CSV export. Voltages are recorded at the exact cycle they change (last 5 s kept) |
| Probing any net (not only board pins) | ⛔ | |
| Live pin monitor D0–D13 / A0–A5 | ✅ | Mode, instantaneous and averaged volts, PWM duty, current with warnings |
| Inspector connections | ✅ | Every pin of the selected part and what it's joined to |
| ESP32 / Raspberry Pi Pico | ⛔ | Not emulated, and never presented as AVR |

## Parts

Every part is labelled in the library as **Simulated**, **Partially simulated** (part of its behaviour is set by hand or approximated, stated in its note) or **Visual only**.

**Simulated:**
- Uno, Nano, breadboards
- resistor, LED, RGB LED, push button, slide switch, potentiometer, capacitor (DC)
- diode, NPN, PNP, N-MOSFET
- buzzer, servo, DC motor
- 9 V and AA batteries, bench supply
- LDR, thermistor, HC-SR04, voltmeter, ammeter
- 7-segment display (common cathode/anode)
- relay module: 10 ms pull-in, 5 ms release
- joystick (KY-023)
- DHT11 and DHT22, speaking the real single-wire protocol (tested with the Adafruit DHT library)
- 74HC08 / 32 / 00 / 86 / 04 logic chips (they also work without an Arduino)
- OLED 0.96" 128×64 (SSD1306) on I²C: the TWI bus is simulated (transfers take their real time at the program's SCL rate; a device answers only when wired to A4/A5 and powered), and the SSD1306 command set and display RAM follow the datasheet. Tested with Adafruit_SSD1306 and an I²C scanner. Hardware scrolling isn't animated; supply current is a typical 5 mA.

**Partially simulated:**
- PIR (HC-SR501): motion and hold time are real; warm-up and field of view are not.
- IR obstacle (FC-51): obstacle present or not, set by hand.
- TCRT5000 line sensor and soil moisture: linear approximations of typical modules.

**Missing:** LCD 16×2 / 20×4 / I²C, MPU6050, rotary encoder, LED matrix, NeoPixel, stepper and motor drivers. The I²C bus is ready for more devices; LiquidCrystal and LiquidCrystal_I2C aren't in the compiler yet.

## Code editor

| Feature | Status | Notes |
|---|---|---|
| CodeMirror 6 with C++ highlighting and inline compile errors | ✅ | |
| Multiple files: add, rename, delete | ✅ | The main `.ino` can't be renamed or deleted; `#include` lines aren't rewritten on rename |
| Code font size (A−/A+), remembered per device | ✅ | |
| Find / replace (Ctrl+F), go to line (Ctrl+Alt+G), selection matches | ✅ | |
| Arduino autocompletion with snippets, auto-closing brackets | ✅ | Core API, constants and words already in the file |
| Search across files, format, light theme, board picker in the UI | ⛔ | |

## 3D Studio (`/lab/3d`)

| Feature | Status | Notes |
|---|---|---|
| Solids: box (with rounded edges), cylinder, cone, sphere, torus, wedge, tube, extruded text | ✅ | Built by Manifold (WebAssembly); always closed, printable solids |
| Holes, group/union, subtract, intersect, ungroup | ✅ | Real booleans (tested volumes) |
| Move / rotate / scale gizmo with mm and angle snapping; numeric position, rotation, scale and size | ✅ | |
| Mirror X/Y/Z, align (min / centre / max per axis), drop to bed, lay flat on a clicked face, centre on bed | ✅ | |
| Views (iso, top, front, right, bottom), fit, click / shift-click selection, undo/redo, lock | ✅ | |
| Printer presets and build volume check | ✅ | Neptune 3 Plus (320×320×400), Neptune 4 Pro, Ender-3 V2, Prusa MK4, Bambu A1; the outline turns red when parts fall outside |
| Volume, size, triangle count; warnings for below-bed, floating and not-closed parts | ✅ | |
| Export STL (binary, one merged solid), OBJ, GLB (with colours), project JSON | ✅ | Millimetres |
| Import STL / OBJ | ✅ | Up to 60 000 triangles; open meshes are shown and flagged, but not cut or exported |
| Saving, autosave, versions, conflict handling | ✅ | Same as circuits |
| Arabic text | ⛔ | The bundled font is Latin only |
| Fillet/chamfer on arbitrary edges, sketch-based modelling, measurement tool | ⛔ | |
| Slicing / G-code | ⛔ | Not offered: export STL to a slicer |
| Geometry in a worker | ⛔ | Runs on the main thread; fine for typical school parts |

## Not started

These routes show an honest "coming" page:
- Blockly code blocks
- Academy / tutorials
- Challenges
- Classrooms
- Admin / CMS
- Robotics arena
