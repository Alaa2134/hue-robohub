/**
 * Arabic personal names in Latin letters, the way Egyptians write them on passports, badges and
 * conference lists: «محمد عبد الرحمن السيد» → "Mohamed Abdelrahman El-Sayed".
 *
 * Common first and family names come from a dictionary with their usual spelling; anything else is
 * spelled out letter by letter with Egyptian sounds (ج = g, ق = k) and a guess at the short vowels
 * Arabic doesn't write. Those guesses are marked so a person can check them before a file goes out.
 */

/** Usual spellings. Keys are written naturally and normalised below (أ/إ/آ → ا, ة → ه, ى → ي). */
const DICT: Record<string, string> = {
  // Men
  محمد: "Mohamed", احمد: "Ahmed", محمود: "Mahmoud", مصطفى: "Mostafa", مصطفي: "Mostafa", يوسف: "Youssef", عمر: "Omar", علي: "Ali", حسن: "Hassan",
  حسين: "Hussein", ابراهيم: "Ibrahim", إبراهيم: "Ibrahim", خالد: "Khaled", كريم: "Karim", طارق: "Tarek", عمرو: "Amr", هاني: "Hany", هشام: "Hesham",
  وليد: "Walid", ياسر: "Yasser", ايمن: "Ayman", أيمن: "Ayman", اشرف: "Ashraf", أشرف: "Ashraf", شريف: "Sherif", سامح: "Sameh", اسلام: "Islam", إسلام: "Islam",
  عبدالله: "Abdallah", عبدالرحمن: "Abdelrahman", عبدالعزيز: "Abdelaziz", عبدالحميد: "Abdelhamid", عبدالفتاح: "Abdelfattah", عبدالمنعم: "Abdelmoneim",
  عبدالرحيم: "Abdelrahim", عبدالحليم: "Abdelhalim", عبدالعظيم: "Abdelazim", عبدالسلام: "Abdelsalam", عبدالقادر: "Abdelkader", عبدالناصر: "Abdelnasser",
  عبدالوهاب: "Abdelwahab", عبدالغني: "Abdelghany", عبدالجواد: "Abdelgawad", عبدالباسط: "Abdelbasset", عبدالمجيد: "Abdelmeguid", عبدالكريم: "Abdelkarim",
  عبدالخالق: "Abdelkhalek", عبدالحكيم: "Abdelhakim", عبدالرازق: "Abdelrazek", عبدالمطلب: "Abdelmotaleb", عبدالهادي: "Abdelhady", عبدالتواب: "Abdeltawab",
  عبدالصمد: "Abdelsamad", عبدالمقصود: "Abdelmaksoud", عبدالعال: "Abdelaal", عبدالنبي: "Abdelnaby", عبدالبديع: "Abdelbadie", عبدالدايم: "Abdeldayem",
  عبدربه: "Abdrabou", عبده: "Abdou",
  سيد: "Sayed", السيد: "El-Sayed", حمدي: "Hamdy", مجدي: "Magdy", رمضان: "Ramadan", جمال: "Gamal", كمال: "Kamal", عادل: "Adel", عماد: "Emad",
  سامي: "Samy", رامي: "Ramy", فادي: "Fady", شادي: "Shady", مدحت: "Medhat", مراد: "Morad", ماجد: "Maged", ممدوح: "Mamdouh", منير: "Mounir",
  نبيل: "Nabil", نصر: "Nasr", ناصر: "Nasser", نادر: "Nader", هيثم: "Haitham", وائل: "Wael", ياسين: "Yassin", يحيى: "Yehia", يحيي: "Yehia",
  زياد: "Ziad", زكريا: "Zakaria", سعد: "Saad", سعيد: "Said", سليمان: "Soliman", سمير: "Samir", صلاح: "Salah", صالح: "Saleh", صبري: "Sabry",
  طه: "Taha", عاطف: "Atef", عصام: "Essam", عزت: "Ezzat", علاء: "Alaa", عيد: "Eid", فتحي: "Fathy", فاروق: "Farouk", فريد: "Farid", فهمي: "Fahmy",
  فؤاد: "Fouad", فوزي: "Fawzy", قاسم: "Kassem", لطفي: "Lotfy", ماهر: "Maher", مجدى: "Magdy", محسن: "Mohsen", مختار: "Mokhtar", مرسي: "Morsy",
  مسعد: "Mosaad", معتز: "Moataz", مهند: "Mohanad", مؤمن: "Moamen", مومن: "Moamen", موسى: "Moussa", موسي: "Moussa", نور: "Nour", هاشم: "Hashem",
  حازم: "Hazem", حاتم: "Hatem", حامد: "Hamed", حمادة: "Hamada", حماده: "Hamada", حمزة: "Hamza", حمزه: "Hamza", حسام: "Hossam", حلمي: "Helmy",
  خليل: "Khalil", رأفت: "Raafat", رافت: "Raafat", رجب: "Ragab", رضا: "Reda", رشاد: "Rashad", رشدي: "Roshdy", رفعت: "Refaat", رامز: "Ramez",
  زين: "Zein", زينهم: "Zeinhom", سالم: "Salem", سامر: "Samer", ساهر: "Saher", شعبان: "Shaaban", شوقي: "Shawky", شاكر: "Shaker", صابر: "Saber",
  صفوت: "Safwat", ضياء: "Diaa", طلعت: "Talaat", ظريف: "Zarif", عاصم: "Assem", عامر: "Amer", عباس: "Abbas", عثمان: "Osman", عرفة: "Arafa",
  عرفه: "Arafa", عزيز: "Aziz", عطية: "Attia", عطيه: "Attia", عوض: "Awad", غريب: "Gharib", فارس: "Fares", فيصل: "Faisal", كرم: "Karam",
  لؤي: "Loay", لوي: "Loay", مازن: "Mazen", مالك: "Malek", متولي: "Metwally", مجاهد: "Mogahed", محروس: "Mahrous", مرزوق: "Marzouk", مرعي: "Mareiy",
  مسلم: "Moslem", منصور: "Mansour", مهدي: "Mahdy", نجيب: "Naguib", نشأت: "Nashaat", نعيم: "Naeem", هلال: "Helal", همام: "Hammam", وجدي: "Wagdy",
  وحيد: "Wahid", يسري: "Yousry", يونس: "Younis", انس: "Anas", أنس: "Anas", اياد: "Eyad", إياد: "Eyad", ادهم: "Adham", أدهم: "Adham", امير: "Amir",
  أمير: "Amir", ايهاب: "Ehab", إيهاب: "Ehab", باسم: "Bassem", بلال: "Belal", تامر: "Tamer", توفيق: "Tawfik", ثروت: "Tharwat", جابر: "Gaber",
  جلال: "Galal", جورج: "George", جرجس: "Gerges", حنفي: "Hanafy", خيري: "Khairy", درويش: "Darwish", رياض: "Riad", سراج: "Serag", سلامة: "Salama",
  سلامه: "Salama", سيف: "Seif", شهاب: "Shehab", شحاتة: "Shehata", شحاته: "Shehata", صادق: "Sadek", عبدو: "Abdo", عزالدين: "Ezz El-Din",
  نورالدين: "Nour El-Din", سيفالدين: "Seif El-Din", بهاء: "Bahaa", بهاءالدين: "Bahaa El-Din", علاءالدين: "Alaa El-Din", جمالالدين: "Gamal El-Din",
  محي: "Mohy", محيي: "Mohy", محيالدين: "Mohy El-Din", فخري: "Fakhry", كامل: "Kamel", مينا: "Mina", مايكل: "Michael", بيتر: "Peter", مارك: "Mark",
  ابانوب: "Abanoub", أبانوب: "Abanoub", كيرلس: "Kirollos", بولس: "Boulos", بطرس: "Boutros", شنودة: "Shenouda", شنوده: "Shenouda", فيلوباتير: "Philopater",
  ريمون: "Raymond", ابو: "Abu", أبو: "Abu", بكر: "Bakr", ابوبكر: "Abu Bakr", الله: "Allah",
  // Women
  فاطمة: "Fatma", فاطمه: "Fatma", مريم: "Mariam", اية: "Aya", ايه: "Aya", آية: "Aya", نوران: "Nouran", سلمى: "Salma", سلمي: "Salma", سارة: "Sara",
  ساره: "Sara", حبيبة: "Habiba", حبيبه: "Habiba", روان: "Rawan", منة: "Menna", منه: "Menna", منةالله: "Mennatallah", منهالله: "Mennatallah", شهد: "Shahd",
  ملك: "Malak", جنى: "Jana", جنا: "Jana", ندى: "Nada", ندي: "Nada", ياسمين: "Yasmin", هنا: "Hana", هناء: "Hanaa", اسراء: "Esraa", إسراء: "Esraa",
  دعاء: "Doaa", اسماء: "Asmaa", أسماء: "Asmaa", هبة: "Heba", هبه: "Heba", ريم: "Reem", رنا: "Rana", دينا: "Dina", مي: "Mai", منى: "Mona", مني: "Mona",
  اميرة: "Amira", أميرة: "Amira", اميره: "Amira", بسملة: "Basmala", بسمله: "Basmala", رحمة: "Rahma", رحمه: "Rahma", رودينا: "Rodina", فريدة: "Farida",
  فريده: "Farida", جومانا: "Jomana", جمانة: "Jomana", لوجين: "Logine", لجين: "Logine", نورهان: "Nourhan", ميار: "Mayar", مروة: "Marwa", مروه: "Marwa",
  نهى: "Noha", نهي: "Noha", نهال: "Nehal", نادية: "Nadia", ناديه: "Nadia", نجلاء: "Naglaa", نيرة: "Nayera", نيره: "Nayera", هالة: "Hala", هاله: "Hala",
  هدى: "Hoda", هدي: "Hoda", وفاء: "Wafaa", ولاء: "Walaa", يارا: "Yara", يمنى: "Yomna", يمني: "Yomna", زينب: "Zeinab", سمر: "Samar", سهى: "Soha",
  سهير: "Soheir", شيماء: "Shaimaa", شيرين: "Sherine", صفاء: "Safaa", عائشة: "Aisha", عايدة: "Aida", عبير: "Abeer", عزة: "Azza", عزه: "Azza",
  غادة: "Ghada", غاده: "Ghada", فرح: "Farah", كريمة: "Karima", ليلى: "Laila", ليلي: "Laila", لمياء: "Lamiaa", ماجدة: "Magda", ماجده: "Magda",
  مها: "Maha", ميرنا: "Merna", ميرال: "Miral", ايمان: "Eman", إيمان: "Eman", امل: "Amal", أمل: "Amal", الاء: "Alaa", آلاء: "Alaa", بسنت: "Basant",
  تسنيم: "Tasneem", جميلة: "Gamila", جيهان: "Gihan", حنان: "Hanan", خديجة: "Khadiga", خديجه: "Khadiga", داليا: "Dalia", رانيا: "Rania", رحاب: "Rehab",
  رضوى: "Radwa", رضوي: "Radwa", رقية: "Rokaya", رقيه: "Rokaya", روضة: "Rawda", ريهام: "Reham", سماح: "Samah", سناء: "Sanaa", سوزان: "Suzan",
  شروق: "Shorouk", شيري: "Sherry", عفاف: "Afaf", علياء: "Alyaa", فايزة: "Fayza", كنزي: "Kenzy", لينا: "Lina", مادونا: "Madonna", مارينا: "Marina",
  ماريا: "Maria", ملاك: "Malak", منار: "Manar", ميرفت: "Mervat", نسرين: "Nesreen", نرمين: "Nermin", نيفين: "Nevine", هايدي: "Haidy", وسام: "Wesam",
  معاذ: "Moaz", رغد: "Raghad", ريتال: "Retal", لميس: "Lamis", تيسير: "Taysir", شهيرة: "Shahira", حمدان: "Hamdan", بسمة: "Basma", بسمه: "Basma",
  امنية: "Omnia", أمنية: "Omnia", امنيه: "Omnia", نادين: "Nadine", نيرمين: "Nermine", ايمي: "Emy", جودي: "Judy", كارما: "Karma", ليلة: "Laila", ايناس: "Enas", إيناس: "Enas",
  اسيل: "Aseel", أسيل: "Aseel", اروى: "Arwa", أروى: "Arwa", الين: "Aleen", ايتن: "Eten", بوسي: "Bossy", تقى: "Toka", تقي: "Toka", جنات: "Ganat",
  حلا: "Hala", ديما: "Dima", رهف: "Rahaf", ريتاج: "Retag", ساندي: "Sandy", سجى: "Saga", سجي: "Saga", سهيلة: "Soheila", سهيله: "Soheila", شاهندة: "Shahenda",
  شاهنده: "Shahenda", فجر: "Fagr", لارا: "Lara", ليان: "Layan", مريان: "Marian", نوال: "Nawal", نوارة: "Nawara", هاجر: "Hager", يسرا: "Yosra", يسرى: "Yosra",
  // Family names often written with «ال»
  الشافعي: "El-Shafei", المصري: "El-Masry", الشريف: "El-Sherif", العربي: "El-Araby", النجار: "El-Naggar", الحداد: "El-Haddad", الجمال: "El-Gammal",
  الشيخ: "El-Sheikh", الدسوقي: "El-Desouky", المنشاوي: "El-Menshawy", البنا: "El-Banna", الصاوي: "El-Sawy", الجندي: "El-Gendy", الخولي: "El-Kholy",
  الفقي: "El-Feky", الطويل: "El-Tawil", القاضي: "El-Kady", الهواري: "El-Hawary", الزيات: "El-Zayat", السعيد: "El-Saeed", الحسيني: "El-Husseiny",
  الدين: "El-Din", حسنين: "Hassanein", شلبي: "Shalaby", عبدالباقي: "Abdelbaky", رزق: "Rizk", جاد: "Gad", غنيم: "Ghoneim", زهران: "Zahran",
  بدوي: "Badawy", عيسى: "Eissa", عيسي: "Eissa", حجازي: "Hegazy", سرور: "Sorour", عطا: "Atta", عويس: "Owais", بركات: "Barakat", شاهين: "Shahin",
  صقر: "Sakr", نصار: "Nassar", خطاب: "Khattab", منسي: "Mansy", حماد: "Hammad", فرج: "Farag", عبدالمعطي: "Abdelmoaty", مكي: "Makky", سليم: "Selim",
  العطار: "El-Attar", الطنطاوي: "El-Tantawy", الشعراوي: "El-Shaarawy", الدمرداش: "El-Demerdash", المغربي: "El-Maghraby", البحيري: "El-Beheiry",
  الحفناوي: "El-Hafnawy", الزهيري: "El-Zohairy", الاشقر: "El-Ashkar", القرنفلي: "El-Karanfily", الجزار: "El-Gazzar", المنياوي: "El-Menyawy",
  عبدالستار: "Abdelsattar", عبدالجليل: "Abdelgalil", عبدالمحسن: "Abdelmohsen", شعراوي: "Shaarawy", مروان: "Marwan",
};

const strip = (s: string) =>
  s
    .replace(/[ً-ْٰـ]/g, "") // harakat, dagger alef, tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");

const LOOKUP = new Map(Object.entries(DICT).map(([k, v]) => [strip(k), v]));

const ARABIC = /[؀-ۿ]/;
const LETTER: Record<string, string> = {
  ب: "b", ت: "t", ث: "th", ج: "g", ح: "h", خ: "kh", د: "d", ذ: "z", ر: "r", ز: "z", س: "s", ش: "sh", ص: "s", ض: "d", ط: "t", ظ: "z",
  غ: "gh", ف: "f", ق: "k", ك: "k", ل: "l", م: "m", ن: "n", ه: "h", ء: "", ئ: "e", ؤ: "o",
};

/** Endings with a fixed sound: El-Tantawy, El-Hafnawy, Zahrany, Omnia. */
const ENDINGS: [RegExp, string][] = [
  [/اوي$/, "awy"],
  [/اني$/, "any"],
  [/يه$/, "ia"],
];

/**
 * Letter by letter, with Egyptian sounds. Arabic leaves short vowels out, so one is put back after
 * the first consonant (Samir, Marwan), before a final consonant (Hazem, Tarek) and to break a run of
 * three consonants; two in the middle stay together (Tantawy, Hafnawy).
 */
function spell(word: string): string {
  let w = word;
  let tail = "";
  for (const [re, sound] of ENDINGS)
    if (re.test(w) && w.length > 3) {
      w = w.replace(re, "");
      tail = sound;
      break;
    }
  const chars = [...w];
  const toks: { s: string; c: boolean }[] = [];
  chars.forEach((ch, i) => {
    const first = i === 0;
    const last = i === chars.length - 1 && !tail;
    const next = chars[i + 1];
    if (ch === "ا") toks.push({ s: "a", c: false });
    // A vowel carrier: nothing before «ا» (عادل → Adel), else "a".
    else if (ch === "ع") toks.push({ s: next === "ا" ? "" : "a", c: false });
    else if (ch === "و") toks.push(first || next === "ا" ? { s: "w", c: true } : { s: "o", c: false });
    else if (ch === "ي") toks.push(first || next === "ا" ? { s: "y", c: true } : { s: last ? "y" : "i", c: false });
    else if (ch === "ه" && last && i > 0) toks.push({ s: "a", c: false }); // ة / ه at the end: Fatma, Hamada
    else if (LETTER[ch]) toks.push({ s: LETTER[ch], c: true });
  });
  if (tail) toks.push({ s: tail, c: false });
  const kept = toks.filter((t) => t.s);
  let out = "";
  let run = 0; // consonants in a row so far, counting the vowels put back
  kept.forEach((t, j) => {
    if (t.c && run > 0 && (j === 1 || j === kept.length - 1 || run >= 2)) {
      out += j === 1 ? "a" : "e";
      run = 0;
    }
    out += t.s;
    run = t.c ? run + 1 : 0;
  });
  return out.replace(/aa+/g, "aa").replace(/^aa/, "a");
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export type Translit = { text: string; /** Some of it was spelled out, not taken from the dictionary: check it. */ guessed: boolean };

/** One person's name in English. Latin input is only tidied (spacing and capitals). */
export function nameToEnglish(name: string | null | undefined): Translit {
  const raw = (name ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return { text: "", guessed: false };
  if (!ARABIC.test(raw)) return { text: raw.replace(/\S+/g, (w) => (w === w.toUpperCase() || w === w.toLowerCase() ? cap(w.toLowerCase()) : w)), guessed: false };
  const words = strip(raw)
    .replace(/[^؀-ۿ\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  const parts: string[] = [];
  let guessed = false;
  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    // «عبد الرحمن», «نور الدين», «منة الله», «أبو بكر»: read the pair as one name first.
    const pair = words[i + 1] !== undefined ? w + words[i + 1] : null;
    if (pair && LOOKUP.has(pair)) {
      parts.push(LOOKUP.get(pair)!);
      i++;
      continue;
    }
    if ((w === "عبد" || w === "عبدال") && words[i + 1]) {
      w = "عبد" + (words[i + 1].startsWith("ال") ? words[i + 1] : "ال" + words[i + 1]);
      i++;
    }
    const known = LOOKUP.get(w);
    if (known) {
      parts.push(known);
      continue;
    }
    guessed = true;
    if (w.startsWith("عبدال") && w.length > 5) {
      const rest = w.slice(5);
      parts.push("Abdel" + (LOOKUP.get(rest)?.toLowerCase() ?? spell(rest)));
    } else if (w.startsWith("ال") && w.length > 3) {
      const rest = w.slice(2);
      parts.push("El-" + cap(LOOKUP.get(rest) ?? spell(rest)));
    } else parts.push(cap(spell(w)));
  }
  return { text: parts.map(cap).join(" "), guessed };
}

/** Egyptian mobile numbers in international form for documents that leave the country: +20 100 123 4567. */
export function intlPhone(p: string | null | undefined): string {
  const m = (p ?? "").replace(/[\s-]/g, "").match(/^(?:\+20|0020|20|0)?(1\d{9})$/);
  return m ? `+20 ${m[1].slice(0, 3)} ${m[1].slice(3, 6)} ${m[1].slice(6)}` : (p ?? "");
}
