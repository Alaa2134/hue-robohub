import test from "node:test";
import assert from "node:assert/strict";
import {parseFeed,dedupe} from "./competition-radar.mjs";
const date="Wed, 25 Nov 2026 12:00:00 GMT",now=Date.parse("2026-11-26T12:00:00Z");
const item=(title,link,published=date)=>'<item><title>'+title+'</title><link>'+link+'</link><pubDate>'+published+'</pubDate><source url="https://example.com">Source</source></item>';
test("accept relevant recent results, reject stale, malformed and unrelated",()=>{
 const rows=parseFeed("<rss>"+item("Egypt student robotics competition &amp; registration","https://example.com/1")+item("Robotics competition","javascript:alert(1)")+item("Robotics competition","https://example.com/2","Wed, 1 Jan 2025 12:00:00 GMT")+item("Weather forecast","https://example.com/3")+"</rss>","Robotics",now);
 assert.equal(rows.length,1);assert.match(rows[0].title,/& registration/);assert.ok(rows[0].score>=85);
 assert.equal(dedupe([...rows,...rows]).length,1);
});
