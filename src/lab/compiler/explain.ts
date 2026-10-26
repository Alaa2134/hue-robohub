/**
 * The compiler's common messages explained in plain words, Arabic and English, with what usually
 * fixes them. It reads only the message GCC printed; it never claims to know more than that.
 */
import type { L } from "../circuit/parts";

type Rule = { re: RegExp; why: (m: RegExpMatchArray) => L; fix: (m: RegExpMatchArray) => L };

const RULES: Rule[] = [
  {
    re: /stray '\\(\d+)'|stray '\\[0-9a-fx]+'|stray '[“”‘’]'/i,
    why: () => ({ en: "There's a character the compiler can't read — usually curly quotes or an Arabic letter copied from a website or chat.", ar: "فيه حرف الكومبايلر مش فاهمه — غالبًا علامات تنصيص مقوّسة أو حرف عربي اتنسخ من موقع أو شات." }),
    fix: () => ({ en: "Retype the quotes as \" or ' on that line, and keep Arabic only inside comments or strings.", ar: "اكتب علامات التنصيص من الكيبورد \" أو ' في السطر ده، وخلّي العربي جوه الكومنتات أو النصوص بس." }),
  },
  {
    re: /expected '([;,)\]}])' before/,
    why: (m) => ({ en: `A '${m[1]}' is missing — most often at the end of the line just above.`, ar: `ناقص '${m[1]}' — غالبًا في آخر السطر اللي فوقه.` }),
    fix: (m) => ({ en: `Add '${m[1]}' where the statement ends.`, ar: `ضيف '${m[1]}' في آخر الجملة.` }),
  },
  {
    re: /expected '}' at end of input/,
    why: () => ({ en: "A '{' was opened and never closed.", ar: "فيه '{' اتفتحت ومتقفلتش." }),
    fix: () => ({ en: "Count the braces of each function and if/for; add the missing '}'.", ar: "عدّ الأقواس بتاعة كل دالة و if/for، وضيف '}' الناقصة." }),
  },
  {
    re: /'([A-Za-z_]\w*)' was not declared in this scope/,
    why: (m) => ({ en: `The name '${m[1]}' isn't known here: it's misspelled, used before it's declared, declared inside another function, or comes from a library that isn't included.`, ar: `الاسم '${m[1]}' مش معروف هنا: يا إما مكتوب غلط، أو مستخدم قبل ما يتعرّف، أو متعرّف جوه دالة تانية، أو جاي من مكتبة مش متضافة.` }),
    fix: (m) => ({
      en: `Check the spelling and capitals of '${m[1]}' (Arduino names are case-sensitive), declare it at the top of the sketch, or add the right #include.`,
      ar: `راجع الحروف الكبيرة والصغيرة في '${m[1]}' (أردوينو بيفرّق بينهم)، أو عرّفه في أول الكود، أو ضيف #include المناسب.`,
    }),
  },
  {
    re: /fatal error: ([\w./]+): No such file or directory/,
    why: (m) => ({ en: `The library '${m[1]}' isn't available in the Lab.`, ar: `المكتبة '${m[1]}' مش موجودة في اللاب.` }),
    fix: () => ({ en: "Check the name's spelling; the Lab includes Servo, Wire, Adafruit_GFX, Adafruit_SSD1306 and DHT among others.", ar: "راجع اسمها؛ اللاب فيه Servo وWire وAdafruit_GFX وAdafruit_SSD1306 وDHT وغيرهم." }),
  },
  {
    re: /'([A-Za-z_]\w*)' does not name a type/,
    why: (m) => ({ en: `'${m[1]}' is used as a type the compiler doesn't know, or there's code outside a function.`, ar: `'${m[1]}' مستخدم كنوع الكومبايلر مش عارفه، أو فيه كود برا أي دالة.` }),
    fix: () => ({ en: "Move statements into setup() or loop(), check the type's spelling, or include its library.", ar: "حط الأوامر جوه setup() أو loop()، وراجع اسم النوع، أو ضيف مكتبته." }),
  },
  {
    re: /undefined reference to `(setup|loop)'/,
    why: (m) => ({ en: `Every sketch needs a ${m[1]}() function and it's missing (or misspelled).`, ar: `كل كود لازم يبقى فيه دالة ${m[1]}() وهي مش موجودة (أو مكتوبة غلط).` }),
    fix: (m) => ({ en: `Add: void ${m[1]}() { }`, ar: `ضيف: void ${m[1]}() { }` }),
  },
  {
    re: /redefinition of '([^']+)'/,
    why: (m) => ({ en: `'${m[1]}' is defined twice.`, ar: `'${m[1]}' متعرّف مرتين.` }),
    fix: () => ({ en: "Keep one definition and rename or remove the other.", ar: "سيب تعريف واحد وغيّر اسم التاني أو امسحه." }),
  },
  {
    re: /too (few|many) arguments to function '([^']+)'/,
    why: (m) => ({ en: `'${m[2]}' was called with too ${m[1]} values.`, ar: `'${m[2]}' اتنادت بعدد ${m[1] === "few" ? "أقل" : "أكتر"} من اللازم من القيم.` }),
    fix: () => ({ en: "Match the call to the function's parameters (the compiler's next note shows them).", ar: "خلّي النداء على قد بارامترات الدالة (الملاحظة اللي بعدها في الكومبايلر بتوضحها)." }),
  },
  {
    re: /ISO C\+\+ forbids comparison between pointer and integer/,
    why: () => ({ en: "A character is being compared with a string: \"a\" is text, 'a' is one character.", ar: "بتقارن حرف بنص: \"a\" نص، و'a' حرف واحد." }),
    fix: () => ({ en: "Use single quotes for one character, e.g. if (c == 'a').", ar: "استخدم علامة واحدة للحرف، زي if (c == 'a')." }),
  },
  {
    re: /lvalue required|assignment of read-only/,
    why: () => ({ en: "Something that can't change is on the left of '=' (a constant, or '=' where '==' was meant).", ar: "فيه حاجة متتغيرش على شمال '=' (ثابت، أو كتبت '=' وإنت قصدك '==')." }),
    fix: () => ({ en: "Use '==' to compare; only variables can be assigned.", ar: "استخدم '==' للمقارنة؛ المتغيرات بس هي اللي بتتغير قيمتها." }),
  },
  {
    re: /expected primary-expression before/,
    why: () => ({ en: "Something is missing in an expression — often an extra or missing bracket, or a type written where a value belongs.", ar: "فيه حاجة ناقصة في التعبير — غالبًا قوس زيادة أو ناقص، أو نوع مكتوب مكان قيمة." }),
    fix: () => ({ en: "Look at the brackets on that line and the one above.", ar: "بص على الأقواس في السطر ده واللي فوقه." }),
  },
  {
    re: /overflow in conversion|large integer implicitly truncated|overflow in implicit constant/,
    why: () => ({ en: "The number is too big for its type: an int on the Uno holds −32768 to 32767.", ar: "الرقم أكبر من النوع بتاعه: الـ int في الأونو من −32768 لـ 32767." }),
    fix: () => ({ en: "Use long (or unsigned long for millis()).", ar: "استخدم long (أو unsigned long مع millis())." }),
  },
  {
    re: /region `(text|data)' overflowed|section `\.(text|data)' will not fit/,
    why: () => ({ en: "The program doesn't fit in the Uno's memory (32 KB flash, 2 KB RAM).", ar: "البرنامج أكبر من ذاكرة الأونو (32 كيلو فلاش، 2 كيلو رام)." }),
    fix: () => ({ en: "Put fixed text in F(\"…\"), shrink big arrays, or drop unused libraries.", ar: "حط النصوص الثابتة في F(\"…\")، وصغّر المصفوفات الكبيرة، وشيل المكتبات اللي مش مستخدمة." }),
  },
];

/** Why the compiler said this and what usually fixes it, or null when it's not one we know. */
export function explainCompile(message: string): { why: L; fix: L } | null {
  for (const r of RULES) {
    const m = message.match(r.re);
    if (m) return { why: r.why(m), fix: r.fix(m) };
  }
  return null;
}
