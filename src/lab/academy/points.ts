/**
 * What each Lab challenge is worth. The database keeps the same list (public.lab_challenges, in
 * supabase/migrations/20261026200000_academy.sql) and accepts passes only for these slugs.
 */
export const CHALLENGE_POINTS: Record<string, number> = {
  "blink-2hz": 10,
  "button-hold": 10,
  "serial-echo": 10,
  "traffic-cycle": 20,
  "dimmer-knob": 20,
  "night-light": 20,
  "servo-sweep": 20,
  "buzzer-a4": 20,
  "seg7-seven": 30,
  "robot-oval": 20,
  "robot-rounded": 30,
  "robot-wavy": 30,
};
