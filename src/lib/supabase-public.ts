/** Public Supabase endpoint shared by the BuildX App and the website's application form (publishable key only). */
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zrtfupdnfxxnguznphis.supabase.co").replace(/\/+$/, "");
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_UG59xR2P2HpCPUhFN8xv_A_P3EOr6Gh";
