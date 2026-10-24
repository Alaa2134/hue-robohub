import { describe, expect, it } from "vitest";
import { intlPhone, nameToEnglish } from "./translit";

const en = (s: string) => nameToEnglish(s).text;

describe("nameToEnglish", () => {
  it("uses the usual spelling for common names", () => {
    expect(en("محمد أحمد محمود")).toBe("Mohamed Ahmed Mahmoud");
    expect(en("فاطمة الزهراء")).toMatch(/^Fatma El-/);
    expect(en("مريم مصطفى")).toBe("Mariam Mostafa");
    expect(nameToEnglish("يوسف عمر علي").guessed).toBe(false);
  });

  it("joins compound names", () => {
    expect(en("عبد الرحمن خالد")).toBe("Abdelrahman Khaled");
    expect(en("عبدالله سيد")).toBe("Abdallah Sayed");
    expect(en("منة الله هشام")).toBe("Mennatallah Hesham");
    expect(en("نور الدين السيد")).toBe("Nour El-Din El-Sayed");
    expect(en("أبو بكر")).toBe("Abu Bakr");
    expect(en("عبد الستار")).toBe("Abdelsattar");
  });

  it("ignores harakat, tatweel and the different alef and taa forms", () => {
    expect(en("مُحَمَّد إبراهيـــم")).toBe("Mohamed Ibrahim");
    expect(en("حبيبه")).toBe(en("حبيبة"));
  });

  it("spells out unknown names and says so", () => {
    const r = nameToEnglish("حازم البرلسي");
    expect(r.guessed).toBe(true);
    expect(r.text).toMatch(/^Hazem El-[A-Z][a-z]+$/);
    expect(en("سميح فوزي")).toBe("Samih Fawzy");
    expect(en("أحمد البطاوي")).toBe("Ahmed El-Batawy");
    expect(en("لميس الشبراوي")).toBe("Lamis El-Shabrawy");
  });

  it("tidies names already written in English", () => {
    expect(en("  ahmed   SAMIR ")).toBe("Ahmed Samir");
    expect(en("McDonald")).toBe("McDonald");
    expect(nameToEnglish("Ahmed").guessed).toBe(false);
  });

  it("returns nothing for nothing", () => {
    expect(nameToEnglish(null)).toEqual({ text: "", guessed: false });
  });
});

describe("intlPhone", () => {
  it("writes Egyptian mobiles in international form", () => {
    expect(intlPhone("01001234567")).toBe("+20 100 123 4567");
    expect(intlPhone("+201112345678")).toBe("+20 111 234 5678");
    expect(intlPhone("12345")).toBe("12345");
  });
});
