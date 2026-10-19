"use client";
/**
 * Opening and saving a project. Every change is copied to this device within a second (so a closed
 * tab or a crash loses nothing); account projects also save to the server every 20 seconds and on
 * Ctrl+S. A save names the revision it started from: if someone else saved in between, nothing is
 * overwritten and the editor asks what to do.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { projects, type Project } from "./api";

type Draft = { base: number; data: unknown; title: string; at: number };
const draftKey = (id: string) => `bx-lab-draft:${id}`;
function readDraft(id: string): Draft | null {
  try {
    return JSON.parse(localStorage.getItem(draftKey(id)) ?? "null");
  } catch {
    return null;
  }
}
function writeDraft(id: string, d: Draft) {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify(d));
  } catch {
    /* storage full or blocked: the server copy still saves */
  }
}
const dropDraft = (id: string) => {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    /* ignore */
  }
};

export type SaveState = "saved" | "dirty" | "saving" | "conflict" | "error" | "readonly";

export function useProject<T>(id: string, share: string | null, opts: { getData: () => T; getThumb?: () => string | undefined; onLoad: (data: T, project: Project) => void; version: number }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<"not_found" | "network" | null>(null);
  const [state, setState] = useState<SaveState>("saved");
  const [recovered, setRecovered] = useState<Draft | null>(null);
  const [conflict, setConflict] = useState<{ by: string | null; at: string } | null>(null);
  const revision = useRef(0);
  const loadedVersion = useRef(-1);
  const savingRef = useRef(false);
  const o = useRef(opts);
  o.current = opts;
  const canEdit = project ? project.role !== "viewer" : false;

  const load = useCallback(async () => {
    setError(null);
    try {
      const p = await projects.get(id, share);
      if (!p) return setError("not_found");
      revision.current = p.revision;
      setProject(p);
      const draft = p.role !== "viewer" ? readDraft(id) : null;
      if (draft && draft.base === p.revision && JSON.stringify(draft.data) !== JSON.stringify(p.data)) {
        o.current.onLoad(draft.data as T, p);
        setRecovered(draft);
        setState("dirty");
      } else {
        if (draft) dropDraft(id);
        o.current.onLoad(p.data as T, p);
        setState(p.role === "viewer" ? "readonly" : "saved");
      }
      loadedVersion.current = -2; // the next version bump is the load itself
    } catch {
      setError("network");
    }
  }, [id, share]);

  useEffect(() => {
    void load();
  }, [load]);

  // Any edit: mark dirty and keep a copy on this device.
  useEffect(() => {
    if (!project || !canEdit) return;
    if (loadedVersion.current === -2) {
      loadedVersion.current = opts.version;
      return;
    }
    if (opts.version === loadedVersion.current) return;
    loadedVersion.current = opts.version;
    setState((s) => (s === "conflict" ? s : "dirty"));
    const t = setTimeout(() => writeDraft(id, { base: revision.current, data: o.current.getData(), title: project.title, at: Date.now() }), 700);
    return () => clearTimeout(t);
  }, [opts.version, project, canEdit, id]);

  const save = useCallback(
    async (snapshot?: string) => {
      if (!project || !canEdit || savingRef.current) return false;
      savingRef.current = true;
      setState("saving");
      try {
        const r = await projects.save(id, revision.current, o.current.getData(), { thumbnail: o.current.getThumb?.() }, snapshot);
        if (r.ok) {
          revision.current = r.revision;
          dropDraft(id);
          setRecovered(null);
          setState("saved");
          return true;
        }
        if (r.error === "conflict") {
          const c = r as { by: string | null; at: string };
          setConflict({ by: c.by, at: c.at });
          setState("conflict");
          return false;
        }
        setState("error");
        return false;
      } catch {
        setState("error");
        return false;
      } finally {
        savingRef.current = false;
      }
    },
    [project, canEdit, id],
  );

  // Autosave account projects (device projects save instantly anyway).
  useEffect(() => {
    if (state !== "dirty" || !project) return;
    const t = setTimeout(() => void save(), project.local ? 800 : 20_000);
    return () => clearTimeout(t);
  }, [state, project, save, opts.version]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (state === "dirty" || state === "saving" || state === "conflict") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  const discardRecovered = useCallback(() => {
    dropDraft(id);
    setRecovered(null);
    void load();
  }, [id, load]);

  const resolveReload = useCallback(() => {
    dropDraft(id);
    setConflict(null);
    void load();
  }, [id, load]);

  const resolveCopy = useCallback(async () => {
    if (!project) return null;
    const newId = await projects.create(project.kind, `${project.title} (copy)`.slice(0, 120), o.current.getData(), { description: project.description, tags: project.tags });
    dropDraft(id);
    setConflict(null);
    return newId;
  }, [project, id]);

  const rename = useCallback(
    async (title: string) => {
      if (!project || project.role !== "owner") return;
      await projects.settings(id, { title });
      setProject({ ...project, title });
    },
    [project, id],
  );

  return { project, setProject, error, state, save, recovered, discardRecovered, conflict, resolveReload, resolveCopy, rename, canEdit, reload: load, revision };
}
