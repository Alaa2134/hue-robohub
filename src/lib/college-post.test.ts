import { describe, expect, it } from "vitest";
import { collegePost, guessKind, TRACKS, tracksCount, type CollegeSetup } from "./college-post";

// Placeholder names: the real ones live in the database (site_settings), not in the code.
const setup: CollegeSetup = {
  header: "تحت رعاية رئيس مجلس الأمناء\n\nوتحت إشراف عميد الكلية",
  students: "طلاب برنامجي الروبوتات والأنظمة الذكية",
  college: "كلية الذكاء الاصطناعي والمعلومات",
  university: "جامعة حورس",
  field: "الروبوتات والأنظمة الذكية",
};
const sprint = TRACKS.find((t) => t.name === "Robo Sprint")!;
const sumo = TRACKS.find((t) => t.name === "Robot Sumo")!;

describe("collegePost", () => {
  it("writes a competition the college took part in, in the faculty's style", () => {
    const post = collegePost(setup, {
      event: { key: "form:1", title: "Robotiada Egypt 2026", attended: 4 },
      blurb: "إحدى المسابقات المتخصصة في مجال الروبوتات والأنظمة الذكية",
      tracks: [sprint, sumo],
      names: ["طالب أ", "طالب ب", "طالب ج", "طالب د"],
      supervisor: "م. مشرف، المعيدة بقسم الذكاء الاصطناعي",
    });
    expect(post).toBe(
      [
        setup.header,
        "طلاب برنامجي الروبوتات والأنظمة الذكية بكلية الذكاء الاصطناعي والمعلومات يشاركون في مسابقة Robotiada Egypt 2026 🤖🏆",
        "في إطار حرص كلية الذكاء الاصطناعي والمعلومات بجامعة حورس على دعم الابتكار وتنمية المهارات التطبيقية لدى الطلاب، شارك طلاب برنامجي الروبوتات والأنظمة الذكية في مسابقة Robotiada Egypt 2026، إحدى المسابقات المتخصصة في مجال الروبوتات والأنظمة الذكية، وذلك من خلال مجالين:",
        `🏎️ Robo Sprint: ${sprint.desc}\n\n🥊 Robot Sumo: ${sumo.desc}`,
        "ومثّل الكلية في المسابقة كل من:\n • طالب أ • طالب ب • طالب ج • طالب د",
        "وجاءت مشاركة الطلاب تحت إشراف م. مشرف، المعيدة بقسم الذكاء الاصطناعي",
        "وتأتي هذه المشاركة تأكيدًا على اهتمام القسم والكلية بربط الدراسة الأكاديمية بالتطبيق العملي، وإتاحة الفرصة للطلاب لاختبار مهاراتهم الهندسية والبرمجية في المنافسات المتخصصة، بما يسهم في إعداد كوادر قادرة على الابتكار والمنافسة في مجالات الروبوتات والأنظمة الذكية.",
        "مع خالص تمنياتنا لطلابنا بدوام التوفيق والتميز، ومزيد من النجاحات والإنجازات. 🌟",
      ].join("\n\n"),
    );
  });

  it("an event the team organised: «ينظمون», how many came, no representatives list", () => {
    const post = collegePost(setup, { event: { key: "form:2", title: "ورشة Embedded Systems", attended: 45 }, tracks: [], names: ["x"] });
    expect(post).toContain("ينظمون ورشة Embedded Systems 🛠️");
    expect(post).toContain("نظّم طلاب برنامجي الروبوتات والأنظمة الذكية ورشة Embedded Systems، بمشاركة 45 من الطلاب.");
    expect(post).not.toContain("ومثّل الكلية");
    expect(post).toContain("وتأتي هذه الورشة تأكيدًا");
  });

  it("many names become a number; a result only when typed; no header when none is saved", () => {
    const names = Array.from({ length: 30 }, (_, i) => `طالب ${i}`);
    const post = collegePost({ ...setup, header: "" }, { event: { key: "k", title: "MENA Robotics Summit", attended: 30 }, tracks: [], names, result: "وحصل الفريق على المركز الثاني" });
    expect(post.startsWith("طلاب برنامجي")).toBe(true);
    expect(post).toContain("ومثّل الكلية في القمة 30 من الطلاب.");
    expect(post).toContain("وحصل الفريق على المركز الثاني. 🏆");
    expect(post).toContain("في MENA Robotics Summit.");
    expect(collegePost(setup, { event: { key: "k", title: "MENA Robotics Summit", attended: 0 }, tracks: [], names: [] })).not.toContain("🏆\n");
  });

  it("counts tracks in Arabic", () => {
    expect([1, 2, 3, 10, 11].map(tracksCount)).toEqual(["مجال", "مجالين", "3 مجالات", "10 مجالات", "11 مجالًا"]);
  });
});

describe("guessKind", () => {
  it("knows competitions by the names they go by, and the team's own events", () => {
    expect(guessKind("Robotiada Egypt 2026")).toEqual({ kind: "competition", ours: false });
    expect(guessKind("WRO Egypt")).toEqual({ kind: "competition", ours: false });
    expect(guessKind("ورشة Arduino")).toEqual({ kind: "workshop", ours: true });
    expect(guessKind("MENA Robotics Summit")).toEqual({ kind: "summit", ours: false });
  });
  it("what the team picks wins over the title", () => {
    const post = collegePost(setup, { event: { key: "k", title: "Robotiada Egypt 2026", attended: 0 }, tracks: [], names: [], kind: "visit", ours: false });
    expect(post).toContain("يشاركون في زيارة Robotiada Egypt 2026 🏭✨");
  });
});
