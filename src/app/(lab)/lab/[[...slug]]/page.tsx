import LabApp from "@/lab/app";
import { LAB_STATIC_ROUTES } from "@/lab/routes";

export const dynamicParams = true;

/** The Lab's fixed screens are real pages; a project's own URL (/lab/circuits/<id>) is opened by the app. */
export function generateStaticParams() {
  return LAB_STATIC_ROUTES.map((r) => ({ slug: r ? r.split("/") : undefined }));
}

export default function LabPage() {
  return <LabApp />;
}
