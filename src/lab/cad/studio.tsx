"use client";
/**
 * 3D Studio: model printable parts in millimetres. Shapes, holes and groups (union / subtract /
 * intersect) are real solids from the Manifold kernel; the printer's build volume is checked; STL,
 * OBJ and GLB exports are written from the same solids the viewport shows.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { labEvent } from "../api";
import { useLang } from "../i18n";
import { BASE, navigate } from "../router";
import { Button, Icon, IconButton, Input, Modal, Select, Spinner, cn, toast } from "../ui";
import { useProject } from "../use-project";
import { indexedFrom, loadKernel, mergedSolid, placed, statsOf, toGeometry, toObj, toStl, type Kernel, type Stats } from "./geometry";
import { COLORS, MAX_IMPORT_TRIANGLES, PRINTERS, SHAPES, cadId, cadSettings, emptyCad, newShape, packMesh, printerOf, validCad, type CadDoc, type CadObject, type Vec3 } from "./model";
import { CadStore, useCad } from "./store";
import { Viewport, type Mode, type ViewName, type ViewportApi } from "./viewport";

const PALETTE = ["box", "cylinder", "sphere", "cone", "torus", "wedge", "tube", "text"] as const;
type L = { en: string; ar: string };

function download(name: string, data: BlobPart, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const slug = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "design";

export default function CadStudio({ id, share }: { id: string; share: string | null }) {
  const { t, l } = useLang();
  const store = useMemo(() => new CadStore(emptyCad()), []);
  const { doc, sel, v, canUndo, canRedo } = useCad(store);
  const [kernel, setKernel] = useState<Kernel | null>(null);
  const [kernelError, setKernelError] = useState(false);
  const [mode, setMode] = useState<Mode>("translate");
  const [layFlat, setLayFlat] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [dialog, setDialog] = useState<null | "export">(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const vp = useRef<ViewportApi>(null);
  const file = useRef<HTMLInputElement>(null);

  const proj = useProject<CadDoc>(id, share, {
    version: v,
    getData: () => store.current,
    getThumb: () => {
      const s = vp.current?.snapshot();
      return s && s.length < 280_000 ? s : undefined;
    },
    onLoad: (data) => store.reset(validCad(data) ? data : emptyCad()),
  });
  const readOnly = !proj.canEdit;

  const loadK = useCallback(() => {
    setKernelError(false);
    loadKernel(location.origin + BASE).then(setKernel, () => setKernelError(true));
  }, []);
  useEffect(loadK, [loadK]);

  // Volume and size, a moment after edits settle.
  useEffect(() => {
    if (!kernel) return;
    const h = setTimeout(() => setStats(statsOf(kernel, doc.objects)), 250);
    return () => clearTimeout(h);
  }, [kernel, doc]);

  const one = sel.length === 1 ? doc.objects.find((o) => o.id === sel[0]) : undefined;
  const settings = cadSettings(doc);
  const printer = printerOf(doc);

  /** New shapes go next to the last one so they don't land inside each other. */
  const addShape = (kind: (typeof PALETTE)[number], hole = false) => {
    const n = doc.objects.length;
    // The first shape goes in the middle of the bed, later ones around it.
    const ring = [[0, 0], [35, 0], [-35, 0], [0, 35], [0, -35], [35, 35], [-35, 35], [35, -35], [-35, -35]];
    const [x, y] = ring[n % ring.length].map((c) => c * (1 + Math.floor(n / ring.length)));
    const at: Vec3 = [x, y, 0];
    const o = newShape(kind, at, COLORS[n % (COLORS.length - 2)]);
    o.name = l(SHAPES[kind].name);
    if (hole) {
      o.hole = true;
      o.name = `${l({ en: "Hole", ar: "فتحة" })} · ${o.name}`;
    }
    store.add(o);
  };

  const save = useCallback(async () => {
    if (readOnly) return;
    if (await proj.save()) toast(t("saved"));
  }, [proj, readOnly, t]);

  // Keyboard (never while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (typing || readOnly) return;
      const k = e.key.toLowerCase();
      if (mod && k === "z") (e.preventDefault(), e.shiftKey ? store.redo() : store.undo());
      else if (mod && k === "y") (e.preventDefault(), store.redo());
      else if (mod && k === "d") (e.preventDefault(), store.duplicate());
      else if (mod && k === "g") (e.preventDefault(), e.shiftKey ? store.ungroup() : store.group("union"));
      else if (mod && k === "a") (e.preventDefault(), store.select(store.current.objects.map((o) => o.id)));
      else if (e.key === "Delete" || e.key === "Backspace") (e.preventDefault(), store.remove());
      else if (e.key === "Escape") (setLayFlat(false), store.select([]));
      else if (!mod && k === "m") setMode("translate");
      else if (!mod && k === "r") setMode("rotate");
      else if (!mod && k === "s") setMode("scale");
      else if (!mod && k === "f") vp.current?.fit();
      else if (!mod && k === "h" && store.selection.length) store.selected.forEach((o) => store.set(o.id, { hole: !o.hole }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, save, readOnly]);

  const importMesh = async (f: File) => {
    try {
      const buf = await f.arrayBuffer();
      let geo: THREE.BufferGeometry;
      if (/\.stl$/i.test(f.name)) {
        const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
        geo = new STLLoader().parse(buf);
      } else if (/\.obj$/i.test(f.name)) {
        const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
        const group = new OBJLoader().parse(new TextDecoder().decode(buf));
        const parts: THREE.BufferGeometry[] = [];
        group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) parts.push(m.geometry.index ? m.geometry.toNonIndexed() : m.geometry);
        });
        const { mergeGeometries } = await import("three/examples/jsm/utils/BufferGeometryUtils.js");
        geo = mergeGeometries(parts.map((g) => new THREE.BufferGeometry().setAttribute("position", g.getAttribute("position"))));
      } else throw new Error("type");
      const { v: verts, i } = indexedFrom(geo.index ? geo.toNonIndexed() : geo);
      if (i.length / 3 > MAX_IMPORT_TRIANGLES) {
        toast(l({ en: `Too detailed to keep in a project (${Math.round(i.length / 3)} triangles, max ${MAX_IMPORT_TRIANGLES}).`, ar: `التفاصيل كتير على المشروع (${Math.round(i.length / 3)} مثلث، الأقصى ${MAX_IMPORT_TRIANGLES}).` }), "danger");
        return;
      }
      // Sit it on the bed, centred.
      const b = new THREE.Box3().setFromArray(verts);
      const c = b.getCenter(new THREE.Vector3());
      for (let k = 0; k < verts.length; k += 3) {
        verts[k] -= c.x;
        verts[k + 1] -= c.y;
        verts[k + 2] -= b.min.z;
      }
      const o: CadObject = { id: cadId(), name: f.name.replace(/\.[^.]+$/, "").slice(0, 60), kind: "mesh", params: {}, mesh: packMesh(verts, i), position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: COLORS[6] };
      store.add(o);
      toast(l({ en: `Imported ${Math.round(i.length / 3)} triangles`, ar: `اتستورد ${Math.round(i.length / 3)} مثلث` }));
    } catch {
      toast(l({ en: "Couldn't read that file (STL or OBJ).", ar: "معرفناش نقرأ الملف (STL أو OBJ)." }), "danger");
    }
  };

  const exportAs = async (kind: "stl" | "obj" | "glb" | "json") => {
    if (!kernel || !proj.project) return;
    const name = slug(proj.project.title);
    try {
      if (kind === "json") download(`${name}.buildx.json`, JSON.stringify({ format: "buildx-lab", kind: "cad", title: proj.project.title, data: store.current }, null, 1), "application/json");
      else if (kind === "stl") {
        const m = mergedSolid(kernel, store.current.objects);
        if (!m) return void toast(l({ en: "Nothing to export: add a solid first.", ar: "مفيش حاجة تتصدر: ضيف مجسم الأول." }), "danger");
        download(`${name}.stl`, toStl(m) as BlobPart, "model/stl");
        m.delete();
      } else if (kind === "obj") download(`${name}.obj`, toObj(kernel, store.current.objects), "text/plain");
      else {
        const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
        const scene = new THREE.Scene();
        // glTF is Y-up in metres: turn Z-up millimetres into it.
        const root = new THREE.Group();
        root.rotation.x = -Math.PI / 2;
        root.scale.setScalar(0.001);
        scene.add(root);
        for (const o of store.current.objects) {
          if (o.hidden || o.hole) continue;
          const m = placed(kernel, o);
          if (!m) continue;
          const mesh = new THREE.Mesh(toGeometry(m), new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.55 }));
          mesh.name = o.name;
          root.add(mesh);
          m.delete();
        }
        const glb = (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer;
        download(`${name}.glb`, glb, "model/gltf-binary");
      }
      labEvent("export", id, { format: kind });
      setDialog(null);
    } catch {
      toast(t("error"), "danger");
    }
  };

  if (proj.error)
    return (
      <div className="grid min-h-[60vh] place-items-center p-6 text-center">
        <div className="grid gap-3">
          <p>{proj.error === "not_found" ? t("notFound") : t("error")}</p>
          <Button variant="ghost" onClick={() => navigate("3d")}>
            {t("nav3d")}
          </Button>
        </div>
      </div>
    );
  if (!proj.project)
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner size={28} />
      </div>
    );
  const p = proj.project;
  const statusText = proj.state === "saving" ? t("saving") : proj.state === "dirty" ? t("unsaved") : proj.state === "readonly" ? t("readOnly") : proj.state === "conflict" ? t("conflict") : proj.state === "error" ? t("error") : p.local ? t("savedLocal") : t("saved");
  const size = stats && stats.count ? stats.max.map((x, i) => x - stats.min[i]) : null;
  const outOfBed = !!stats && stats.count > 0 && (stats.min[0] < -printer.bed[0] / 2 - 1e-3 || stats.max[0] > printer.bed[0] / 2 + 1e-3 || stats.min[1] < -printer.bed[1] / 2 - 1e-3 || stats.max[1] > printer.bed[1] / 2 + 1e-3 || stats.max[2] > printer.bed[2] + 1e-3);
  const belowBed = !!stats && stats.count > 0 && stats.min[2] < -1e-3;
  const floating = !!stats && stats.count > 0 && stats.min[2] > 0.01;

  return (
    <div className="flex h-[100dvh] flex-col bg-abyss text-frost" data-testid="cad-studio">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--line)] bg-deep px-2 py-1.5">
        <IconButton icon="back" label={t("nav3d")} onClick={() => navigate("3d")} />
        {titleDraft !== null ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void proj.rename(titleDraft.trim() || p.title);
              setTitleDraft(null);
            }}
          >
            <Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} autoFocus onBlur={() => setTitleDraft(null)} className="h-8 w-56" />
          </form>
        ) : (
          <button type="button" className="max-w-[40vw] truncate font-semibold hover:text-cyan" onClick={() => !readOnly && setTitleDraft(p.title)}>
            {p.title}
          </button>
        )}
        <span className={cn("hidden text-xs sm:inline", proj.state === "dirty" ? "text-warn" : proj.state === "error" || proj.state === "conflict" ? "text-danger" : "text-fog")} data-testid="save-state">
          {statusText}
        </span>
        <span className="flex-1" />
        {!readOnly && (
          <>
            <IconButton icon="undo" label={t("undo")} disabled={!canUndo} onClick={() => store.undo()} />
            <IconButton icon="redo" label={t("redo")} disabled={!canRedo} onClick={() => store.redo()} />
            <div className="flex rounded-lg bg-abyss p-0.5 ring-1 ring-rim" role="radiogroup" aria-label={l({ en: "Gizmo", ar: "أداة التحريك" })}>
              {(
                [
                  ["translate", { en: "Move (M)", ar: "تحريك (M)" }],
                  ["rotate", { en: "Rotate (R)", ar: "لف (R)" }],
                  ["scale", { en: "Scale (S)", ar: "تكبير (S)" }],
                ] as [Mode, L][]
              ).map(([m, label]) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn("rounded-md px-2 py-1 text-xs", mode === m ? "bg-volt text-white" : "text-mist hover:text-frost")} data-testid={`mode-${m}`}>
                  {l(label)}
                </button>
              ))}
            </div>
          </>
        )}
        <select aria-label={l({ en: "View", ar: "الزاوية" })} className="h-8 w-28 rounded-lg bg-abyss px-2 text-xs text-frost ring-1 ring-rim" value="" onChange={(e) => e.target.value && vp.current?.view(e.target.value as ViewName)} data-testid="cad-view">
          <option value="">{l({ en: "View…", ar: "الزاوية…" })}</option>
          <option value="iso">{l({ en: "Iso", ar: "منظور" })}</option>
          <option value="top">{l({ en: "Top", ar: "فوق" })}</option>
          <option value="front">{l({ en: "Front", ar: "قدّام" })}</option>
          <option value="right">{l({ en: "Right", ar: "يمين" })}</option>
          <option value="bottom">{l({ en: "Bottom", ar: "تحت" })}</option>
        </select>
        <IconButton icon="fit" label={t("fit")} onClick={() => vp.current?.fit()} />
        {!readOnly && (
          <>
            <input ref={file} type="file" accept=".stl,.obj" className="hidden" onChange={(e) => (e.target.files?.[0] && void importMesh(e.target.files[0]), (e.target.value = ""))} />
            <Button size="sm" icon="upload" onClick={() => file.current?.click()} disabled={!kernel}>
              STL / OBJ
            </Button>
          </>
        )}
        <Button size="sm" icon="download" onClick={() => setDialog("export")} disabled={!kernel} data-testid="cad-export">
          {l({ en: "Export", ar: "تصدير" })}
        </Button>
        {!readOnly && (
          <Button size="sm" variant="primary" icon="save" onClick={() => void save()} disabled={proj.state === "saving"}>
            {t("save")}
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Palette */}
        {!readOnly && (
          <aside className="w-44 shrink-0 overflow-y-auto border-e border-[var(--line)] bg-deep p-2 max-md:w-28" data-testid="cad-palette">
            <p className="mb-1.5 px-1 text-[11px] font-semibold tracking-wide text-fog uppercase">{l({ en: "Solids", ar: "مجسمات" })}</p>
            <div className="grid gap-1">
              {PALETTE.map((k) => (
                <button key={k} type="button" disabled={!kernel} onClick={() => addShape(k)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm hover:bg-panel disabled:opacity-40" data-testid={`add-${k}`}>
                  <Icon name="cube" size={15} className="text-cyan" />
                  {l(SHAPES[k].name)}
                </button>
              ))}
            </div>
            <p className="mt-3 mb-1.5 px-1 text-[11px] font-semibold tracking-wide text-fog uppercase">{l({ en: "Holes", ar: "فتحات" })}</p>
            <div className="grid gap-1">
              {(["cylinder", "box", "text"] as const).map((k) => (
                <button key={k} type="button" disabled={!kernel} onClick={() => addShape(k, true)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm hover:bg-panel disabled:opacity-40" data-testid={`add-hole-${k}`}>
                  <Icon name="cube" size={15} className="text-danger" />
                  {l(SHAPES[k].name)}
                </button>
              ))}
            </div>
            <p className="mt-3 px-1 text-[11px] leading-relaxed text-fog">{l({ en: "A hole cuts the solids it's grouped with (select both, then Group).", ar: "الفتحة بتقطع المجسمات اللي معاها في نفس الجروب (حدد الاتنين ودوس Group)." })}</p>
          </aside>
        )}

        {/* Viewport */}
        <main className="relative min-w-0 flex-1">
          {kernel ? (
            <Viewport ref={vp} store={store} doc={doc} selection={sel} kernel={kernel} mode={mode} layFlat={layFlat} onLaidFlat={() => setLayFlat(false)} readOnly={readOnly} onFailed={setFailed} />
          ) : kernelError ? (
            <div className="grid size-full place-items-center p-6 text-center">
              <div className="grid gap-3">
                <p className="text-sm text-mist">{l({ en: "The geometry engine didn't load. Check your connection.", ar: "محرك الهندسة متحمّلش. اتأكد من النت." })}</p>
                <Button onClick={loadK}>{t("retry")}</Button>
              </div>
            </div>
          ) : (
            <div className="grid size-full place-items-center text-sm text-fog">
              <span className="flex items-center gap-2">
                <Spinner size={16} /> {l({ en: "Loading the geometry engine…", ar: "بيحمّل محرك الهندسة…" })}
              </span>
            </div>
          )}
          {layFlat && <p className="pointer-events-none absolute inset-x-0 top-3 text-center text-sm text-cyan">{l({ en: "Click the face that should sit on the bed (Esc to cancel)", ar: "اضغط على الوش اللي عايزه ينام على السرير (Esc للإلغاء)" })}</p>}
          {/* Status */}
          <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-deep/90 px-3 py-1.5 font-mono text-[11px] text-mist ring-1 ring-rim backdrop-blur" data-testid="cad-stats" dir="ltr">
            <span>{printer.name}</span>
            <span>
              {stats?.count ?? 0} {l({ en: "solids", ar: "مجسم" })}
            </span>
            {size && (
              <span>
                {size[0].toFixed(1)} × {size[1].toFixed(1)} × {size[2].toFixed(1)} mm
              </span>
            )}
            {stats && stats.count > 0 && <span>{(stats.volume / 1000).toFixed(2)} cm³</span>}
            {stats && stats.count > 0 && <span>{stats.triangles.toLocaleString()} △</span>}
            {outOfBed && <span className="text-danger">{l({ en: "Bigger than the build volume", ar: "أكبر من مساحة الطباعة" })}</span>}
            {belowBed && <span className="text-danger">{l({ en: "Below the bed: drop it", ar: "تحت السرير: نزّله عليه" })}</span>}
            {floating && !belowBed && <span className="text-warn">{l({ en: "Not touching the bed", ar: "مش لامس السرير" })}</span>}
            {failed.length > 0 && <span className="text-warn">{l({ en: `${failed.length} object(s) aren't closed solids`, ar: `${failed.length} حاجة مش مجسم مقفول` })}</span>}
          </div>
        </main>

        {/* Inspector */}
        <aside className="w-72 shrink-0 overflow-y-auto border-s border-[var(--line)] bg-deep p-3 text-sm max-lg:hidden" data-testid="cad-inspector">
          {one ? (
            <ObjectPanel key={one.id} o={one} store={store} readOnly={readOnly} vp={vp} failed={failed.includes(one.id)} onLayFlat={() => setLayFlat(true)} />
          ) : sel.length > 1 ? (
            <MultiPanel store={store} count={sel.length} readOnly={readOnly} vp={vp} />
          ) : (
            <div className="grid gap-4">
              <p className="text-fog">{l({ en: "Click a shape to edit it; Shift+click to select several. Add shapes from the left.", ar: "اضغط على شكل عشان تعدّله؛ Shift+ضغطة لتحديد أكتر من حاجة. ضيف أشكال من الشمال." })}</p>
              {!readOnly && (
                <>
                  <label className="grid gap-1">
                    <span className="text-xs text-fog">{l({ en: "Printer", ar: "الطابعة" })}</span>
                    <Select value={settings.printer} onChange={(e) => store.setSettings({ printer: e.target.value })} data-testid="cad-printer">
                      {PRINTERS.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} ({x.bed.join(" × ")} mm)
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-fog">{l({ en: "Move snap", ar: "خطوة التحريك" })}</span>
                    <Select value={settings.snap} onChange={(e) => store.setSettings({ snap: Number(e.target.value) })}>
                      {[0, 0.1, 0.5, 1, 2, 5, 10].map((x) => (
                        <option key={x} value={x}>
                          {x ? `${x} mm` : l({ en: "off", ar: "مقفول" })}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-fog">{l({ en: "Rotate snap", ar: "خطوة اللف" })}</span>
                    <Select value={settings.angleSnap} onChange={(e) => store.setSettings({ angleSnap: Number(e.target.value) })}>
                      {[0, 5, 15, 45, 90].map((x) => (
                        <option key={x} value={x}>
                          {x ? `${x}°` : l({ en: "off", ar: "مقفول" })}
                        </option>
                      ))}
                    </Select>
                  </label>
                </>
              )}
              <p className="text-xs leading-relaxed text-fog">{l({ en: "Shortcuts: M move · R rotate · S scale · H hole · Ctrl+G group · Ctrl+Shift+G ungroup · Ctrl+D duplicate · Del delete · F fit.", ar: "اختصارات: M تحريك · R لف · S تكبير · H فتحة · Ctrl+G جروب · Ctrl+Shift+G فك · Ctrl+D تكرار · Del حذف · F ملائمة." })}</p>
            </div>
          )}
        </aside>
      </div>

      <Modal open={dialog === "export"} onClose={() => setDialog(null)} title={l({ en: "Export", ar: "تصدير" })}>
        <div className="grid gap-2">
          <Button onClick={() => void exportAs("stl")} data-testid="export-stl">
            STL — {l({ en: "for slicers (Cura, OrcaSlicer, PrusaSlicer), one merged solid", ar: "للسلايسر (Cura وOrca وPrusa)، مجسم واحد مدموج" })}
          </Button>
          <Button onClick={() => void exportAs("obj")}>OBJ — {l({ en: "one object per solid", ar: "كل مجسم لوحده" })}</Button>
          <Button onClick={() => void exportAs("glb")}>GLB — {l({ en: "with colours, for viewers and games", ar: "بالألوان، للعرض والألعاب" })}</Button>
          <Button variant="ghost" onClick={() => void exportAs("json")}>
            {l({ en: "BuildX project file (.json)", ar: "ملف مشروع BuildX (.json)" })}
          </Button>
          <p className="text-xs text-fog">{l({ en: "Units are millimetres. Slicing (layers, supports, G-code) is done in your slicer: BuildX doesn't slice.", ar: "الوحدات بالمليمتر. التقطيع (الطبقات والدعامات وG-code) بيتعمل في السلايسر: BuildX مش بيعمل slicing." })}</p>
        </div>
      </Modal>

      <Modal open={!!proj.conflict} onClose={() => {}} title={t("conflict")}>
        <div className="flex flex-wrap gap-2">
          <Button onClick={proj.resolveReload}>{t("reload")}</Button>
          <Button
            variant="primary"
            onClick={async () => {
              const nid = await proj.resolveCopy();
              if (nid) navigate(`3d/${nid}`);
            }}
          >
            {t("saveCopy")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/* ── Inspector panels ─────────────────────────────────────────────────── */

function NumField({ label, value, onChange, disabled, min, max, step = 0.5, suffix, testId }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean; min?: number; max?: number; step?: number; suffix?: string; testId?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace(",", "."));
    if (Number.isFinite(n)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
    setDraft(null);
  };
  return (
    <label className="grid gap-0.5">
      <span className="text-[11px] text-fog">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          className="h-7 w-full min-w-0 rounded-md bg-abyss px-2 font-mono text-xs ring-1 ring-rim focus:ring-cyan focus:outline-none disabled:opacity-50"
          value={draft ?? String(Math.round(value * 1000) / 1000)}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value + (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1))));
            }
          }}
          dir="ltr"
          data-testid={testId}
        />
        {suffix && <span className="text-[11px] text-fog">{suffix}</span>}
      </span>
    </label>
  );
}

function ObjectPanel({ o, store, readOnly, vp, failed, onLayFlat }: { o: CadObject; store: CadStore; readOnly: boolean; vp: React.RefObject<ViewportApi | null>; failed: boolean; onLayFlat: () => void }) {
  const { t, l } = useLang();
  const ro = readOnly || !!o.locked;
  const box = vp.current?.boxes().get(o.id);
  const shape = o.kind in SHAPES ? SHAPES[o.kind as keyof typeof SHAPES] : null;
  const setVec = (k: "position" | "rotation" | "scale", i: number, v: number) => store.set(o.id, { [k]: o[k].map((x, j) => (j === i ? v : x)) as Vec3 }, `${k}:${o.id}`);
  return (
    <div className="grid gap-4">
      <Input value={o.name} onChange={(e) => store.set(o.id, { name: e.target.value.slice(0, 60) }, `name:${o.id}`)} disabled={ro} className="h-8 font-semibold" aria-label={l({ en: "Name", ar: "الاسم" })} />
      {failed && <p className="rounded-lg bg-warn/15 p-2 text-xs text-warn">{l({ en: "This isn't a closed solid (an imported mesh with gaps, or text the font can't draw). It's shown but can't be cut or exported.", ar: "دي مش مجسم مقفول (ملف فيه فتحات أو نص الخط مش بيرسمه). بتتعرض بس مش بتتقطع ولا بتتصدر." })}</p>}
      <div className="flex rounded-lg bg-abyss p-0.5 ring-1 ring-rim" role="radiogroup">
        {[false, true].map((h) => (
          <button key={String(h)} type="button" role="radio" aria-checked={!!o.hole === h} disabled={ro} onClick={() => store.set(o.id, { hole: h })} className={cn("flex-1 rounded-md py-1 text-xs", !!o.hole === h ? (h ? "bg-danger/80 text-white" : "bg-volt text-white") : "text-mist")} data-testid={h ? "set-hole" : "set-solid"}>
            {h ? l({ en: "Hole", ar: "فتحة" }) : l({ en: "Solid", ar: "مُصمت" })}
          </button>
        ))}
      </div>
      {!o.hole && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={l({ en: "Colour", ar: "اللون" })}>
          {COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={o.color === c} aria-label={c} disabled={ro} onClick={() => store.set(o.id, { color: c })} className={cn("size-6 rounded-full ring-2", o.color === c ? "ring-cyan" : "ring-transparent")} style={{ background: c }} />
          ))}
        </div>
      )}
      {shape && (
        <div className="grid grid-cols-2 gap-2">
          {shape.params.map((d) =>
            d.text ? (
              <label key={d.key} className="col-span-2 grid gap-0.5">
                <span className="text-[11px] text-fog">{l(d.label)}</span>
                <Input value={String(o.params[d.key] ?? "")} maxLength={40} onChange={(e) => store.setParam(o.id, d.key, e.target.value)} disabled={ro} className="h-8" dir="ltr" />
              </label>
            ) : (
              <NumField key={d.key} label={l(d.label)} value={Number(o.params[d.key])} min={d.min} max={d.max} step={d.step} disabled={ro} onChange={(v) => store.setParam(o.id, d.key, v)} testId={`param-${d.key}`} />
            ),
          )}
        </div>
      )}
      {o.kind === "group" && (
        <p className="text-xs text-fog">
          {l({ en: "Group", ar: "جروب" })} · {o.op === "subtract" ? l({ en: "first minus the rest", ar: "الأول ناقص الباقي" }) : o.op === "intersect" ? l({ en: "only the overlap", ar: "الجزء المشترك بس" }) : l({ en: "union, holes cut", ar: "دمج، والفتحات بتقطع" })} · {o.children?.length}
        </p>
      )}
      {(["position", "rotation", "scale"] as const).map((k) => (
        <div key={k}>
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-cyan uppercase">{k === "position" ? l({ en: "Position (mm)", ar: "المكان (مم)" }) : k === "rotation" ? l({ en: "Rotation (°)", ar: "اللف (°)" }) : l({ en: "Scale", ar: "التكبير" })}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(["X", "Y", "Z"] as const).map((ax, i) => (
              <NumField key={ax} label={ax} value={o[k][i]} step={k === "rotation" ? 15 : k === "scale" ? 0.1 : 1} disabled={ro} onChange={(v) => setVec(k, i, v)} testId={`${k}-${ax.toLowerCase()}`} />
            ))}
          </div>
        </div>
      ))}
      {box && (
        <p className="font-mono text-xs text-mist" dir="ltr" data-testid="cad-size">
          {(box.max.x - box.min.x).toFixed(2)} × {(box.max.y - box.min.y).toFixed(2)} × {(box.max.z - box.min.z).toFixed(2)} mm
        </p>
      )}
      {!readOnly && (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => store.drop(vp.current!.boxes(), [o.id])} disabled={ro} data-testid="cad-drop">
            {l({ en: "Drop to bed", ar: "نزّل على السرير" })}
          </Button>
          <Button size="sm" onClick={onLayFlat} disabled={ro}>
            {l({ en: "Lay flat on a face", ar: "نيّمه على وش" })}
          </Button>
          <Button size="sm" onClick={() => store.set(o.id, { position: [0, 0, o.position[2]] })} disabled={ro}>
            {l({ en: "Centre on bed", ar: "في نص السرير" })}
          </Button>
          {(["X", "Y", "Z"] as const).map((ax, i) => (
            <Button key={ax} size="sm" onClick={() => store.mirror(i as 0 | 1 | 2, [o.id])} disabled={ro}>
              {l({ en: "Mirror", ar: "عكس" })} {ax}
            </Button>
          ))}
          {o.kind === "group" && (
            <Button size="sm" onClick={() => store.ungroup([o.id])} disabled={ro}>
              {l({ en: "Ungroup", ar: "فك الجروب" })}
            </Button>
          )}
          <Button size="sm" icon="copy" onClick={() => store.duplicate([o.id])}>
            {t("duplicate")}
          </Button>
          <Button size="sm" icon={o.locked ? "lock" : "lock"} onClick={() => store.set(o.id, { locked: !o.locked })}>
            {o.locked ? l({ en: "Unlock", ar: "فك التثبيت" }) : l({ en: "Lock", ar: "تثبيت" })}
          </Button>
          <Button size="sm" variant="danger" icon="trash" onClick={() => store.remove([o.id])} disabled={ro}>
            {t("del")}
          </Button>
        </div>
      )}
    </div>
  );
}

function MultiPanel({ store, count, readOnly, vp }: { store: CadStore; count: number; readOnly: boolean; vp: React.RefObject<ViewportApi | null> }) {
  const { t, l } = useLang();
  if (readOnly) return <p className="text-fog">{count}</p>;
  return (
    <div className="grid gap-4">
      <p className="font-semibold">
        {count} {l({ en: "selected", ar: "متحدد" })}
      </p>
      <div className="grid gap-1.5">
        <Button size="sm" variant="primary" onClick={() => store.group("union")} data-testid="cad-group">
          {l({ en: "Group (union, holes cut)", ar: "جروب (دمج، والفتحات تقطع)" })}
        </Button>
        <Button size="sm" onClick={() => store.group("subtract")} data-testid="cad-subtract">
          {l({ en: "Subtract (first selected minus the rest)", ar: "طرح (أول واحد اتحدد ناقص الباقي)" })}
        </Button>
        <Button size="sm" onClick={() => store.group("intersect")}>
          {l({ en: "Intersect (keep the overlap)", ar: "تقاطع (سيب الجزء المشترك)" })}
        </Button>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-semibold tracking-wide text-cyan uppercase">{l({ en: "Align", ar: "محاذاة" })}</p>
        <div className="grid grid-cols-3 gap-1">
          {(["X", "Y", "Z"] as const).map((ax, i) =>
            (["min", "center", "max"] as const).map((w) => (
              <Button key={ax + w} size="sm" onClick={() => store.align(vp.current!.boxes(), i as 0 | 1 | 2, w)}>
                {ax} {w === "min" ? "◀" : w === "max" ? "▶" : "◆"}
              </Button>
            )),
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => store.drop(vp.current!.boxes())}>
          {l({ en: "Drop to bed", ar: "نزّل على السرير" })}
        </Button>
        <Button size="sm" icon="copy" onClick={() => store.duplicate()}>
          {t("duplicate")}
        </Button>
        <Button size="sm" variant="danger" icon="trash" onClick={() => store.remove()}>
          {t("del")}
        </Button>
      </div>
    </div>
  );
}
