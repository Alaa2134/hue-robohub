/**
 * Who an event's attendance counts. A form whose responses the team reviews (anyone accepted or put
 * on the waiting list) counts only the accepted — "new" there means not reviewed yet, not accepted.
 * A form nobody reviews (open registration, everyone still "new") counts everyone who registered.
 * Whoever was let in at the door anyway (marked present) is counted too: they came.
 * The database applies the same rule at the door (staff_form_mark).
 */
export type Status = "new" | "accepted" | "rejected" | "waiting" | string;

export const reviewed = (rs: { status: Status }[]) => rs.some((r) => r.status === "accepted" || r.status === "waiting");

export function attendancePeople<R extends { id: string; status: Status }>(rs: R[], came: (r: R) => boolean = () => false): R[] {
  const review = reviewed(rs);
  return rs.filter((r) => r.status === "accepted" || (r.status === "new" && !review) || came(r));
}
