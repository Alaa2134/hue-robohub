/**
 * Writes what Baqloz knows (src/lib/mascot/knowledge.ts: tracks, teams, the bootcamp, the plan, the
 * FAQ…) as plain text for his AI Edge Function, which reads it from the published site
 * (buildxhue.com/guide-knowledge.txt), so the AI always answers from the site as it is now.
 * The static build runs it; on its own:
 *
 *   npx tsx scripts/build-guide-knowledge.ts out-static/guide-knowledge.txt
 */
import { writeFileSync } from "node:fs";
import { knowledgeText } from "../src/lib/mascot/knowledge";

const out = process.argv[2];
if (!out) throw new Error("usage: build-guide-knowledge.ts <output file>");
writeFileSync(out, `${knowledgeText()}\n`);
console.log(`wrote ${out}`);
