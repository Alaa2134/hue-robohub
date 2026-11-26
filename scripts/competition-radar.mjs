// Public RSS only: no credentials, search API key, or LLM. No private data leaves the app.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
export const QUERIES=[
 ["Robotics","Egypt robotics competition university students OR RoboCup OR Robocon OR Robotex"],
 ["Hackathon","Egypt hackathon university students competition OR registration"],
 ["AI","Egypt artificial intelligence competition students hackathon"],
 ["Innovation","Egypt innovation competition university students entrepreneurship"],
 ["Robotics Arabic","مسابقة روبوتات مصر طلاب الجامعات تسجيل"],
 ["Hackathon Arabic","هاكاثون مسابقة ابتكار ذكاء اصطناعي الجامعات مصر تسجيل"],
 ["Embedded","Egypt embedded systems IoT electronics competition students"]
];
const unescape=s=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&#(\d+);/g,(_,n)=>{const v=Number(n);return v<=0x10ffff?String.fromCodePoint(v):"";}).replace(/<[^>]*>/g,"").trim();
const tag=(xml,name)=>unescape(xml.match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)</"+name+">","i"))?.[1]??"");
export function parseFeed(xml,category,now=Date.now()){
 return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(m=>{
  const title=tag(m[1],"title"),link=tag(m[1],"link"),source=tag(m[1],"source"),date=new Date(tag(m[1],"pubDate")),age=(now-date.getTime())/86400000;
  if(!title||!/^https:\/\/[^\s]+$/i.test(link)||!Number.isFinite(age)||age>45||age< -1)return null;
  const relevance=/competition|hackathon|robot|registration|innovation|contest|challenge|مسابق|هاكاثون|روبوت|ابتكار|تسجيل/i;
  if(!relevance.test(title))return null;
  const score=50+(/registration|apply|open|تسجيل|التقديم|باب/i.test(title)?20:0)+(/university|student|جامع|طلاب/i.test(title)?15:0)+Math.max(0,15-Math.floor(age));
  return {id:createHash("sha256").update(link).digest("hex").slice(0,20),title:title.slice(0,220),link,source:source.slice(0,160),published:date.toISOString(),category,score};
 }).filter(Boolean);
}
export function dedupe(items){
 const seen=new Set();return items.sort((a,b)=>b.score-a.score||b.published.localeCompare(a.published)).filter(x=>{
  const key=x.title.toLowerCase().replace(/\s*[-–—]\s*[^-–—]+$/,"").replace(/[\p{P}\s]+/gu,"").trim();
  if(seen.has(x.link)||seen.has(key))return false;seen.add(x.link);seen.add(key);return true;
 }).slice(0,80);
}
async function main(){
 const results=await Promise.allSettled(QUERIES.map(async([category,q])=>{
  const params=new URLSearchParams({q:q+" when:45d",hl:"ar",gl:"EG",ceid:"EG:ar"});
  const response=await fetch("https://news.google.com/rss/search?"+params,{signal:AbortSignal.timeout(15000),headers:{"User-Agent":"BuildX-HUE-Competition-Radar/1.0"}});
  if(!response.ok)throw Error(String(response.status));
  const xml=await response.text();if(!/<rss[\s>]/i.test(xml))throw Error("Invalid RSS");
  return parseFeed(xml,category);
 }));
 const failed=results.flatMap((r,i)=>r.status==="rejected"?[QUERIES[i][0]]:[]);
 if(failed.length===QUERIES.length)throw Error("All RSS queries failed; previous feed remains unchanged");
 const items=dedupe(results.flatMap(r=>r.status==="fulfilled"?r.value:[]));
 await writeFile(process.argv[2]??"competition-radar.json",JSON.stringify({generated_at:new Date().toISOString(),failed,items},null,2)+"\n");
 console.log("Radar candidates:",items.length,"failed queries:",failed.length);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
