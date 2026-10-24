"use client";
/**
 * Arduino C++ editor (CodeMirror 6, bundled — nothing loaded from a CDN). Compiler errors and
 * warnings show as underlines and gutter marks on the lines GCC reported.
 */
import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import { bracketMatching, indentOnInput, syntaxHighlighting, HighlightStyle, foldGutter } from "@codemirror/language";
import { lintGutter, setDiagnostics, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { autocompletion, closeBrackets, closeBracketsKeymap, completeAnyWord, completionKeymap, snippetCompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import type { Diagnostic } from "../compiler/sketch";

const theme = EditorView.theme(
  {
    "&": { height: "100%", fontSize: "var(--code-font, 13px)", backgroundColor: "#060f27", color: "#dfe8f7" },
    ".cm-scroller": { fontFamily: "var(--font-jbmono), ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: "1.55" },
    ".cm-gutters": { backgroundColor: "#060f27", color: "#4d6290", border: "none" },
    ".cm-activeLine": { backgroundColor: "rgba(47,123,255,.08)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(47,123,255,.12)", color: "#9fb6e6" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "rgba(47,123,255,.35) !important" },
    ".cm-cursor": { borderLeftColor: "#3cc4ff" },
    ".cm-tooltip": { backgroundColor: "#0b1b3f", border: "1px solid #1d3468", color: "#e6edf9" },
    ".cm-diagnostic-error": { borderLeft: "3px solid #ff4d5e" },
    ".cm-diagnostic-warning": { borderLeft: "3px solid #ffb547" },
    ".cm-panels": { backgroundColor: "#0b1b3f", color: "#c9d6ee", borderColor: "#1d3468" },
    ".cm-panels .cm-textfield": { backgroundColor: "#060f27", color: "#e6edf9", border: "1px solid #1d3468", borderRadius: "6px", padding: "3px 6px" },
    ".cm-panels .cm-button": { backgroundImage: "none", backgroundColor: "#142a5c", color: "#e6edf9", border: "1px solid #1d3468", borderRadius: "6px" },
    ".cm-searchMatch": { backgroundColor: "rgba(255,181,71,.25)", outline: "1px solid rgba(255,181,71,.5)" },
    ".cm-searchMatch-selected": { backgroundColor: "rgba(255,181,71,.5)" },
    ".cm-selectionMatch": { backgroundColor: "rgba(60,196,255,.15)" },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#2f7bff", color: "#fff" },
    ".cm-completionDetail": { color: "#8ea3c9" },
  },
  { dark: true },
);
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.modifier], color: "#ff7ab2" },
  { tag: [t.typeName, t.standard(t.typeName)], color: "#6bdfff" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#ffd479" },
  { tag: [t.number, t.bool, t.null], color: "#d0a8ff" },
  { tag: [t.string, t.character], color: "#ffa77a" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#5f7aa8", fontStyle: "italic" },
  { tag: [t.processingInstruction, t.meta], color: "#7ef2b4" },
  { tag: t.macroName, color: "#7ef2b4" },
  { tag: t.operator, color: "#c4d3ef" },
]);

/** The Arduino core API, with placeholders to tab through. */
const ARDUINO: Completion[] = [
  snippetCompletion("pinMode(${pin}, ${OUTPUT})", { label: "pinMode", type: "function", detail: "(pin, mode)" }),
  snippetCompletion("digitalWrite(${pin}, ${HIGH})", { label: "digitalWrite", type: "function", detail: "(pin, value)" }),
  snippetCompletion("digitalRead(${pin})", { label: "digitalRead", type: "function", detail: "(pin) → HIGH/LOW" }),
  snippetCompletion("analogRead(${A0})", { label: "analogRead", type: "function", detail: "(pin) → 0–1023" }),
  snippetCompletion("analogWrite(${pin}, ${value})", { label: "analogWrite", type: "function", detail: "(pin, 0–255) PWM" }),
  snippetCompletion("delay(${ms})", { label: "delay", type: "function", detail: "(ms)" }),
  snippetCompletion("delayMicroseconds(${us})", { label: "delayMicroseconds", type: "function", detail: "(µs)" }),
  snippetCompletion("millis()", { label: "millis", type: "function", detail: "() → ms since start" }),
  snippetCompletion("micros()", { label: "micros", type: "function", detail: "() → µs since start" }),
  snippetCompletion("map(${value}, ${fromLow}, ${fromHigh}, ${toLow}, ${toHigh})", { label: "map", type: "function", detail: "(value, fromLow, fromHigh, toLow, toHigh)" }),
  snippetCompletion("constrain(${x}, ${low}, ${high})", { label: "constrain", type: "function", detail: "(x, low, high)" }),
  snippetCompletion("tone(${pin}, ${frequency})", { label: "tone", type: "function", detail: "(pin, Hz[, ms])" }),
  snippetCompletion("noTone(${pin})", { label: "noTone", type: "function", detail: "(pin)" }),
  snippetCompletion("pulseIn(${pin}, ${HIGH})", { label: "pulseIn", type: "function", detail: "(pin, level[, timeout]) → µs" }),
  snippetCompletion("attachInterrupt(digitalPinToInterrupt(${2}), ${isr}, ${FALLING})", { label: "attachInterrupt", type: "function", detail: "(interrupt, isr, mode)" }),
  snippetCompletion("random(${max})", { label: "random", type: "function", detail: "([min,] max)" }),
  snippetCompletion("Serial.begin(${9600})", { label: "Serial.begin", type: "method", detail: "(baud)" }),
  snippetCompletion("Serial.println(${value})", { label: "Serial.println", type: "method", detail: "(value)" }),
  snippetCompletion("Serial.print(${value})", { label: "Serial.print", type: "method", detail: "(value)" }),
  snippetCompletion("Serial.available()", { label: "Serial.available", type: "method", detail: "() → bytes waiting" }),
  snippetCompletion("Serial.read()", { label: "Serial.read", type: "method", detail: "() → byte or -1" }),
  snippetCompletion("Serial.readStringUntil('${\\n}')", { label: "Serial.readStringUntil", type: "method", detail: "(terminator)" }),
  snippetCompletion("void setup() {\n\t${}\n}\n\nvoid loop() {\n\t\n}", { label: "setup / loop", type: "keyword", detail: "sketch skeleton" }),
  snippetCompletion("for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}", { label: "for", type: "keyword", detail: "loop" }),
  snippetCompletion("#include <Servo.h>", { label: "#include <Servo.h>", type: "keyword" }),
  snippetCompletion("#include <Wire.h>", { label: "#include <Wire.h>", type: "keyword" }),
  ...["HIGH", "LOW", "INPUT", "OUTPUT", "INPUT_PULLUP", "LED_BUILTIN", "A0", "A1", "A2", "A3", "A4", "A5", "RISING", "FALLING", "CHANGE"].map((label) => ({ label, type: "constant" })),
];

const ARDUINO_LABELS = new Set(ARDUINO.map((c) => c.label));
/** Words already in the file, minus the ones the Arduino list offers with a snippet. */
async function completeWords(ctx: CompletionContext) {
  const r = await completeAnyWord(ctx);
  return r && { ...r, options: r.options.filter((o) => !ARDUINO_LABELS.has(o.label)) };
}

function completeArduino(ctx: CompletionContext) {
  const word = ctx.matchBefore(/[#\w.]+/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  return { from: word.from, options: ARDUINO, validFor: /^[#\w.]*$/ };
}

export function CodeEditor({ value, onChange, diagnostics, readOnly, fileName }: { value: string; onChange: (v: string) => void; diagnostics: Diagnostic[]; readOnly?: boolean; fileName: string }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const ro = useRef(new Compartment());
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          foldGutter(),
          lintGutter(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          highlightSelectionMatches(),
          search({ top: true }),
          autocompletion({ override: [completeArduino, completeWords] }),
          cpp(),
          syntaxHighlighting(highlight),
          theme,
          EditorState.tabSize.of(2),
          keymap.of([...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, indentWithTab, ...defaultKeymap, ...historyKeymap]),
          ro.current.of(EditorState.readOnly.of(!!readOnly)),
          EditorView.updateListener.of((u) => u.docChanged && change.current(u.state.doc.toString())),
          EditorView.contentAttributes.of({ "aria-label": "Code editor", spellcheck: "false", autocapitalize: "off" }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // The editor is created once; file switches replace its content below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value, fileName]);

  useEffect(() => {
    view.current?.dispatch({ effects: ro.current.reconfigure(EditorState.readOnly.of(!!readOnly)) });
  }, [readOnly]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc;
    const list: CmDiagnostic[] = diagnostics
      .filter((d) => d.file === fileName && d.line >= 1 && d.line <= doc.lines && d.severity !== "note")
      .map((d) => {
        const line = doc.line(d.line);
        const from = Math.min(line.to, line.from + Math.max(0, d.col - 1));
        const m = line.text.slice(from - line.from).match(/^[\w.]+/);
        return { from, to: Math.max(from + 1, Math.min(line.to, from + (m?.[0].length ?? 1))), severity: d.severity === "error" ? "error" : "warning", message: d.message };
      });
    v.dispatch(setDiagnostics(v.state, list));
  }, [diagnostics, fileName, value]);

  return <div ref={host} dir="ltr" className="h-full min-h-0 overflow-hidden" data-testid="code-editor" />;
}

/** Jump the editor to a line (used by the diagnostics list). */
export function gotoLine(container: HTMLElement | null, line: number) {
  const el = container?.querySelector(".cm-editor");
  const v = el ? EditorView.findFromDOM(el as HTMLElement) : null;
  if (!v || line < 1 || line > v.state.doc.lines) return;
  const pos = v.state.doc.line(line).from;
  v.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  v.focus();
}
