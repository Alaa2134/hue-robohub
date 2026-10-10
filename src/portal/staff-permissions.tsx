"use client";
/** The owner's overview: every team member against every area (full, view only or nothing), and what each area allows. */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { AREAS, ROLE_LABEL, rpc, type Area, type Level, type Role } from "./core";
import { Badge, Card, ErrorBox, Icon, Loading, TopBar, go, useAsync } from "./ui";

type MatrixRow = { user_id: string; name: string; role: Role; title: string | null; full: boolean; areas: Record<Area, Level> };

const CELL: Record<Level, { mark: string; tone: string; label: string }> = {
  full: { mark: "✓", tone: "bg-volt/25 text-chalk", label: "كامل" },
  view: { mark: "👁", tone: "bg-cyan/20 text-cyan", label: "مشاهدة بس" },
  none: { mark: "—", tone: "text-fog/50", label: "مالوش" },
};

export function PermissionsScreen() {
  const { data, error, loading, reload } = useAsync(() => rpc<MatrixRow[]>("staff_permission_matrix"), []);
  const [area, setArea] = useState<Area | null>(null);
  const shown = area ? AREAS.filter((a) => a.key === area) : AREAS;
  return (
    <>
      <TopBar title="مين عنده إيه" sub="صلاحيات الفريق كله في جدول واحد" back="/staff/more" />
      <Card className="mb-4 grid gap-2 text-xs leading-relaxed text-fog">
        <div className="flex flex-wrap gap-3">
          {(["full", "view", "none"] as const).map((l) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className={cn("inline-flex size-6 items-center justify-center rounded-md text-sm", CELL[l].tone)}>{CELL[l].mark}</span>
              {CELL[l].label}
            </span>
          ))}
        </div>
        <p>
          لتغيير صلاحيات حد: «الفريق والصلاحيات» واضغط على اسمه. اضغط على اسم أي قسم في الجدول عشان تشوف هو بيسمح بإيه.
        </p>
      </Card>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--line)]" data-testid="permission-matrix">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="bg-white/[0.03]">
                <th className="sticky start-0 z-10 bg-[var(--panel,#0b1530)] px-3 py-2 text-start font-semibold text-mist">العضو</th>
                {shown.map((a) => (
                  <th key={a.key} className="px-1 py-2 align-bottom font-normal">
                    <button type="button" onClick={() => setArea(area === a.key ? null : a.key)} className={cn("max-w-[5.5rem] text-[11px] leading-tight", area === a.key ? "text-cyan" : "text-fog hover:text-mist")}>
                      {a.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((r) => (
                <tr key={r.user_id} className="border-t border-[var(--line)]">
                  <th scope="row" className="sticky start-0 z-10 bg-[var(--panel,#0b1530)] px-3 py-2 text-start font-normal">
                    <button type="button" onClick={() => go("/staff/team")} className="grid text-start">
                      <span className="max-w-[9rem] truncate text-[13px] font-semibold text-chalk">{r.name}</span>
                      <span className="flex items-center gap-1 text-[11px] text-fog">
                        {ROLE_LABEL[r.role]}
                        {r.full && <Badge tone="volt">كل حاجة</Badge>}
                      </span>
                    </button>
                  </th>
                  {shown.map((a) => {
                    const l = r.areas[a.key] ?? "none";
                    return (
                      <td key={a.key} className="px-1 py-1.5 text-center" data-level={l}>
                        <span title={`${r.name} · ${a.label}: ${CELL[l].label}`} className={cn("inline-flex size-7 items-center justify-center rounded-md text-sm", CELL[l].tone)}>
                          {CELL[l].mark}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 className="mb-2 mt-6 text-sm font-semibold text-chalk">كل صلاحية بتسمح بإيه</h2>
      <div className="grid gap-2">
        {AREAS.map((a) => (
          <Card key={a.key} className={cn("grid gap-1 text-xs", area === a.key && "border-cyan/50")}>
            <p className="flex items-center gap-2 text-sm font-semibold text-chalk">
              {a.label} <span className="text-[11px] font-normal text-fog">{a.group}</span>
            </p>
            <p className="text-mist">
              <b className="text-chalk">كامل:</b> {a.hint}
            </p>
            <p className="flex items-center gap-1 text-fog">
              <Icon name="eye" size={14} />
              {a.view ? `مشاهدة: ${a.view}` : "مالوش مستوى مشاهدة (يا كامل يا مالوش)."}
            </p>
          </Card>
        ))}
      </div>
    </>
  );
}
