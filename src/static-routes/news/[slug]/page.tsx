import { itemPage } from "@/components/live/item-page";

const page = itemPage("post");

export const dynamicParams = false;
export const generateStaticParams = page.generateStaticParams;
export const generateMetadata = page.generateMetadata;
export default page.Page;
