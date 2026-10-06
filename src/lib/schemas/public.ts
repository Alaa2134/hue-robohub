import { z } from "zod";

const url = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\/[^\s]+$/i.test(v), "Must be a full http(s) URL")
  .transform((v) => v || null);

export const applicationSchema = z.object({
  fullName: z.string().trim().min(3, "Enter your full name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(24)
    .regex(/^[+\d][\d\s()-]{6,23}$/, "Enter a valid phone number"),
  academicYear: z.coerce.number().int().min(1, "Select your year").max(7),
  trackId: z.string().uuid().nullable().or(z.literal("").transform(() => null)),
  skills: z
    .string()
    .max(500)
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20)
        .map((s) => s.slice(0, 40)),
    ),
  experience: z.string().trim().max(3000).default(""),
  portfolioUrl: url,
  githubUrl: url,
  motivation: z.string().trim().min(30, "Tell us a bit more (at least 30 characters)").max(3000),
  availability: z.string().trim().min(3, "Tell us when you're available").max(500),
  consent: z.literal("on", { message: "Consent is required" }),
});
export type ApplicationInput = z.infer<typeof applicationSchema>;

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  organization: z.string().trim().max(160).optional().transform((v) => v || null),
  topic: z.enum(["general", "partnership", "media", "workshop", "other"]),
  message: z.string().trim().min(20, "Message is too short").max(5000),
});
