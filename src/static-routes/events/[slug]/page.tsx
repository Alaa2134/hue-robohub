import { itemPage } from "@/components/live/item-page";

const page = itemPage("event");

export const dynamicParams = false;
export const generateStaticParams = page.generateStaticParams;
export const generateMetadata = page.generateMetadata;
export default page.Page;
