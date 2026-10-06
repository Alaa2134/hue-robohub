import { notFound } from "next/navigation";

/** Unmatched public URLs render the localized "signal lost" page inside the site layout. */
export default function CatchAll() {
  notFound();
}
