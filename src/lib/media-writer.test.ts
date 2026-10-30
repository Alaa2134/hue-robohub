import { describe, expect, it } from "vitest";
import { arCount, captions, hashtags, kindOf, mergeSameDay, newsAfter, type DeskEvent } from "./media-writer";

const summit: DeskEvent = {
  key: "form:1",
  slug: "attend-gaggs",
  title: "MENA ROBOTICS SUMMIT 2026",
  title_en: "MENA ROBOTICS SUMMIT 2026",
  at: "2026-10-30T03:00:00Z",
  place: null,
  registered: 78,
  accepted: 47,
  attended: 45,
  sessions: 3,
  rating: 4.5,
  ratings: 12,
  photos: 0,
  form: true,
};
const NOW = Date.parse("2026-10-31T12:00:00Z");

describe("media writer", () => {
  it("counts in Arabic", () => {
    expect(arCount(1)).toBe("طالب واحد");
    expect(arCount(2)).toBe("طالبين");
    expect(arCount(7)).toBe("7 طلاب");
    expect(arCount(45)).toBe("45 طالب");
    expect(arCount(3, "جلسة", "جلستين", "جلسات")).toBe("3 جلسات");
  });

  it("knows the kind of event from its title", () => {
    expect(kindOf("Workshop 01 – Introduction to Embedded Systems").ar).toBe("ورشة");
    expect(kindOf("MENA ROBOTICS SUMMIT 2026").ar).toBe("قمة");
    expect(kindOf("زيارة معرض Robotex").ar).toBe("زيارة");
    expect(kindOf("يوم مفتوح").ar).toBe("فعالية");
  });

  it("a summit the team went to: «شارك», not «نظّم», and the bus trip", () => {
    const n = newsAfter({ ...summit, sessions: 1, bus: true });
    expect(n.body).toContain("شارك 45 طالب من BuildX HUE");
    expect(n.body).toContain("بأتوبيسات الفريق");
    expect(n.body).toContain("(من 78 سجّلوا)");
    expect(n.body).not.toContain("نظّم");
    expect(captions({ ...summit, bus: true }, NOW).linkedin).toContain("45 BuildX HUE students took part in MENA ROBOTICS SUMMIT 2026.");
  });

  it("writes the news post from the real numbers only", () => {
    const workshop = { ...summit, key: "form:w", title: "Workshop 01 – Embedded", title_en: null };
    const n = newsAfter(workshop);
    expect(n.body).toContain("45 طالب");
    expect(n.body).toContain("78 سجّلوا");
    expect(n.body).toContain("نظّم فريق BuildX HUE");
    expect(n.body).toContain("3 جلسات");
    expect(n.body).toContain("4.5 من 5 (12 تقييم)");
    expect(n.body).not.toContain("صور");
    expect(n.summary).toBe(n.body.split("\n\n")[0]);
    // The same event always reads the same.
    expect(newsAfter(workshop)).toEqual(n);
  });

  it("leaves out what isn't worth saying: few ratings, a low turnout, no photos", () => {
    const n = newsAfter({ ...summit, attended: 21, registered: 50, ratings: 2, sessions: 1 });
    expect(n.body).toContain("21 طالب");
    expect(n.body).not.toContain("من أصل");
    expect(n.body).not.toContain("تقييم");
    expect(n.body).not.toContain("جلسات");
  });

  it("hashtags from the title, no repeats", () => {
    expect(hashtags({ ...summit, title: "Workshop 01 – Introduction to Embedded Systems with Arduino", title_en: null })).toEqual(["#BuildX_HUE", "#HorusUniversity", "#Workshop", "#EmbeddedSystems", "#Arduino"]);
  });

  it("after the event: a recap; before it: the invitation with the link and how long is left", () => {
    const after = captions(summit, NOW);
    expect(after.facebook).toContain("45 طالب");
    expect(after.facebook).toContain("⭐ تقييم الحضور: 4.5/5");
    expect(after.linkedin).not.toContain("at Horus University");
    expect(captions({ ...summit, title: "Workshop 9", title_en: "Workshop 9", place: "جامعة حورس" }, NOW).linkedin).toContain("Wrapped up Workshop 9 at Horus University, with 45 students attending.");
    const before = captions({ ...summit, at: "2026-11-02T10:00:00Z" }, NOW);
    expect(before.facebook).toContain("https://buildxhue.com/ar/form/?f=attend-gaggs");
    expect(before.facebook).toContain("فاضل يومين");
    expect(before.whatsapp).toContain("📣 MENA ROBOTICS SUMMIT 2026");
  });

  it("the website event and its form on the same day are one event", () => {
    const merged = mergeSameDay([
      { ...summit, key: "event:9", title: "ورشة Embedded Systems 01", at: "2026-10-19T11:00:00Z", registered: 0, attended: 0, photos: 14, place: "جامعة حورس", cover: "/c.webp", form: false },
      { ...summit, key: "form:2", title: "Workshop 01 – Introduction to Embedded Systems", at: "2026-10-19T09:30:00Z", registered: 50, attended: 21, photos: 0, cover: null },
      { ...summit, key: "form:3", at: "2026-10-30T03:00:00Z" },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ key: "form:2", keys: ["event:9", "form:2"], title: "ورشة Embedded Systems 01", attended: 21, photos: 14, place: "جامعة حورس", cover: "/c.webp", form: true });
  });
});
