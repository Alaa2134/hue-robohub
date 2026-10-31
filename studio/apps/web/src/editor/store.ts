/**
 * The editor's state: the timeline with undo/redo, the selection and the playhead, and autosave
 * (a second after the last change, refused by the server if someone saved a newer version).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Timeline } from "@studio/core";
import { ApiError, api, type Project } from "../api.ts";
import { toast } from "../ui.tsx";

export type SaveState = "saved" | "dirty" | "saving" | "error";

export function useEditor(project: Project, reload: () => void) {
  const [timeline, setTimeline] = useState<Timeline>(project.timeline);
  const [past, setPast] = useState<Timeline[]>([]);
  const [future, setFuture] = useState<Timeline[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("saved");
  const version = useRef(project.timelineVersion);
  const savedJson = useRef(JSON.stringify(project.timeline));
  const latest = useRef(timeline);
  latest.current = timeline;

  /** A change that can be undone. `transient` changes (mid-drag) show at once and land in history on commit. */
  const dragStart = useRef<Timeline | null>(null);
  const apply = useCallback((next: Timeline | ((t: Timeline) => Timeline), opts: { transient?: boolean } = {}) => {
    setTimeline((cur) => {
      const n = typeof next === "function" ? next(cur) : next;
      if (n === cur) return cur;
      if (opts.transient) {
        if (!dragStart.current) dragStart.current = cur;
      } else {
        const before = dragStart.current ?? cur;
        dragStart.current = null;
        setPast((p) => [...p.slice(-199), before]);
        setFuture([]);
      }
      return n;
    });
  }, []);
  /** End a drag: what it started from goes into history once. */
  const commit = useCallback(() => {
    if (!dragStart.current) return;
    const before = dragStart.current;
    dragStart.current = null;
    setPast((p) => [...p.slice(-199), before]);
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [latest.current, ...f].slice(0, 200));
      setTimeline(prev);
      return p.slice(0, -1);
    });
  }, []);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setPast((p) => [...p, latest.current]);
      setTimeline(next);
      return f.slice(1);
    });
  }, []);

  // Autosave.
  const saving = useRef(false);
  const flush = useCallback(async (): Promise<number | null> => {
    const json = JSON.stringify(latest.current);
    if (json === savedJson.current) {
      setSave("saved");
      return version.current;
    }
    if (saving.current) return null;
    saving.current = true;
    setSave("saving");
    try {
      const r = await api<{ version: number }>("PATCH", `/projects/${project.id}/timeline`, { timeline: latest.current, version: version.current });
      version.current = r.version;
      savedJson.current = json;
      setSave(JSON.stringify(latest.current) === json ? "saved" : "dirty");
      return r.version;
    } catch (e) {
      setSave("error");
      if (e instanceof ApiError && e.code === "conflict") {
        toast(e.message, "bad");
        reload();
      } else toast(`ما اتحفظش: ${(e as Error).message}`, "bad");
      return null;
    } finally {
      saving.current = false;
    }
  }, [project.id, reload]);

  useEffect(() => {
    if (JSON.stringify(timeline) === savedJson.current) return;
    setSave("dirty");
    const id = setTimeout(() => void flush(), 1000);
    return () => clearTimeout(id);
  }, [timeline, flush]);

  // Don't lose the last second of work when the tab closes.
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(latest.current) !== savedJson.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, []);

  return { timeline, apply, commit, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0, selected, setSelected, save, flush, version };
}
export type EditorStore = ReturnType<typeof useEditor>;
