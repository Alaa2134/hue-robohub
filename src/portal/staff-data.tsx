"use client";
/** Shared staff data: the student roster (cached for offline scanning), groups and the scan queue. */
import { useEffect, useMemo, useState } from "react";
import { codeKey, digitsOnly, rpc, type Student } from "./core";
import { Select } from "./ui";

const ROSTER_KEY = "rh-app-roster";
let roster: Student[] | null = null;
const subscribers = new Set<() => void>();
let inflight: Promise<Student[]> | null = null;

function readRoster(): Student[] | null {
  try {
    return JSON.parse(localStorage.getItem(ROSTER_KEY) ?? "null") as Student[] | null;
  } catch {
    return null;
  }
}

export function refreshStudents(): Promise<Student[]> {
  inflight ??= rpc<Student[]>("staff_list_students")
    .then((list) => {
      roster = list;
      try {
        localStorage.setItem(ROSTER_KEY, JSON.stringify(list));
      } catch {
        /* quota: the in-memory roster still works */
      }
      subscribers.forEach((f) => f());
      return list;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Local edit after a successful write, so screens update without a refetch. */
export function patchStudents(fn: (list: Student[]) => Student[]) {
  roster = fn(roster ?? []);
  subscribers.forEach((f) => f());
}

export function useStudents() {
  const [list, setList] = useState<Student[] | null>(() => roster);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(!roster);
  useEffect(() => {
    const on = () => setList(roster);
    subscribers.add(on);
    if (!roster) {
      const cached = readRoster();
      if (cached) {
        roster = cached;
        setList(cached);
      }
    }
    refreshStudents()
      .then(() => setError(null))
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
    return () => {
      subscribers.delete(on);
    };
  }, []);
  return { list, error, loading, reload: refreshStudents };
}

export function groupsOf(list: Student[] | null | undefined): string[] {
  return [...new Set((list ?? []).map((s) => s.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
}

export function useGroups(extra: string[] = []) {
  const { list } = useStudents();
  return useMemo(() => [...new Set([...groupsOf(list), ...extra.filter(Boolean)])].sort((a, b) => a.localeCompare(b, "ar")), [list, extra]);
}

/** Finds a student by a scanned/typed value the same way attendance_scan does on the server. */
export function makeFinder(list: Student[]) {
  const byCode = new Map<string, Student>();
  const byBarcode = new Map<string, Student>();
  const byDigits = new Map<string, Student[]>();
  for (const s of list) {
    byCode.set(s.codeKey, s);
    if (s.barcodeKey) byBarcode.set(s.barcodeKey, s);
    const d = s.codeKey.replace(/\D/g, "");
    if (d) byDigits.set(d, [...(byDigits.get(d) ?? []), s]);
  }
  return (raw: string): Student | null => {
    const key = codeKey(raw);
    if (!key) return null;
    const hit = byCode.get(key) ?? byBarcode.get(key);
    if (hit) return hit;
    const d = digitsOnly(raw);
    const same = d.length >= 4 ? byDigits.get(d) : undefined;
    return same?.length === 1 ? same[0] : null;
  };
}

export function GroupSelect({
  value,
  onChange,
  groups,
  allLabel = "كل المجموعات",
  allowNew = false,
}: {
  value: string;
  onChange: (v: string) => void;
  groups: string[];
  allLabel?: string;
  allowNew?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  if (adding)
    return (
      <div className="flex gap-2">
        <input
          autoFocus
          className="h-12 w-full rounded-xl border border-cyan/50 bg-deep/80 px-3.5 text-[15px] text-chalk outline-none"
          placeholder="اسم المجموعة الجديدة"
          defaultValue=""
          maxLength={60}
          onBlur={(e) => {
            if (e.target.value.trim()) onChange(e.target.value.trim());
            setAdding(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>
    );
  const all = value && !groups.includes(value) ? [...groups, value] : groups;
  return (
    <Select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__new") setAdding(true);
        else onChange(e.target.value);
      }}
    >
      <option value="">{allLabel}</option>
      {all.map((g) => (
        <option key={g} value={g}>
          {g}
        </option>
      ))}
      {allowNew && <option value="__new">+ مجموعة جديدة…</option>}
    </Select>
  );
}

/* ─── Offline scan queue ───────────────────────────────────────────────── */

export type QueuedScan = { id: string; session: string; raw: string; at: string; method: "scan" | "manual" };
const QUEUE_KEY = "rh-app-scan-queue";

export const scanQueue = {
  all(): QueuedScan[] {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedScan[];
    } catch {
      return [];
    }
  },
  save(list: QueuedScan[]) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
    } catch {
      /* best effort */
    }
  },
  push(item: QueuedScan) {
    scanQueue.save([...scanQueue.all(), item]);
  },
  remove(id: string) {
    scanQueue.save(scanQueue.all().filter((x) => x.id !== id));
  },
  count(session: string) {
    return scanQueue.all().filter((x) => x.session === session).length;
  },
};
