/** Ready-to-send applicant messages (Arabic first, then English) for WhatsApp and email. No sending cost: links only. */
const T: Record<string, { subject: string; ar: string; en: string }> = {
  pending: {
    subject: "BuildX HUE — we received your application",
    ar: "أهلاً {name}، استلمنا طلب انضمامك لـ BuildX HUE. هنراجعه ونتواصل معاك قريب.",
    en: "Hi {name}, we received your application to BuildX HUE. We'll review it and get back to you soon.",
  },
  interview: {
    subject: "BuildX HUE — interview invitation",
    ar: "أهلاً {name}، شكراً لتقديمك في BuildX HUE. حابين نعمل معاك مقابلة قصيرة يوم {when} (بتوقيت القاهرة). من فضلك أكّد حضورك بالرد على الرسالة دي.",
    en: "Hi {name}, thanks for applying to BuildX HUE. We'd like to invite you to a short interview on {when} (Cairo time). Please reply to confirm.",
  },
  accepted: {
    subject: "BuildX HUE — welcome to the team",
    ar: "مبروك يا {name}! تم قبولك في BuildX HUE. هنبعتلك تفاصيل البداية قريب.",
    en: "Congratulations {name}! You've been accepted into BuildX HUE. We'll send onboarding details shortly.",
  },
  trainee: {
    subject: "BuildX HUE — your bootcamp place",
    ar: "أهلاً {name}، تم اختيارك كمتدرّب في بوتكامب BuildX HUE. هنبعتلك الجدول وتفاصيل أول سيشن قريب.",
    en: "Hi {name}, you have a trainee place in the BuildX HUE bootcamp. We'll send the schedule and first-session details soon.",
  },
  waitlist: {
    subject: "BuildX HUE — waitlist",
    ar: "أهلاً {name}، شكراً لتقديمك. حالياً انت على قائمة الانتظار، وهنتواصل معاك أول ما يتوفر مكان.",
    en: "Hi {name}, thanks for applying. You're on our waitlist for now — we'll reach out as soon as a place opens.",
  },
  rejected: {
    subject: "BuildX HUE — your application",
    ar: "أهلاً {name}، شكراً جداً لاهتمامك بـ BuildX HUE. للأسف مش هنقدر نوفّر مكان في الدورة دي، وهنكون مبسوطين لو قدّمت تاني الموسم الجاي.",
    en: "Hi {name}, thank you for your interest in BuildX HUE. We can't offer a place this round, but we'd love to see you apply again next season.",
  },
  converted: {
    subject: "BuildX HUE — you're a member",
    ar: "أهلاً {name}، انت دلوقتي عضو رسمي في BuildX HUE. أهلاً بيك في الفريق!",
    en: "Hi {name}, you're now a member of BuildX HUE. Welcome to the team!",
  },
};

export function recruitMessage(status: string, name: string, when?: { en: string; ar: string } | null) {
  const t = T[status] ?? T.pending!;
  const first = name.trim().split(/\s+/)[0] ?? name;
  const fill = (s: string, w?: string) => s.replaceAll("{name}", first).replaceAll("{when}", w || "—");
  return { subject: t.subject, body: `${fill(t.ar, when?.ar)}\n\n${fill(t.en, when?.en)}\n\n— BuildX HUE` };
}
