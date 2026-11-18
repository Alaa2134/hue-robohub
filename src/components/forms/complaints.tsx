"use client";
import { useState, type FormEvent } from "react";
import { Field, Input, Select, Textarea, FormError } from "@/components/command/field";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

type Locale = "ar" | "en";
type Result = {ok:boolean; error?:string; code?:string; status?:string; reply?:string};
const types = [["complaint","شكوى","Complaint"],["problem","مشكلة","Problem"],["misconduct","إساءة أو سلوك غير لائق","Misconduct"],["suggestion","اقتراح","Suggestion"],["other","أخرى","Other"]];
const departments = [["general","عام","General"],["leadership","الإدارة والقيادة","Leadership"],["hr","الموارد البشرية","HR"],["ai","الذكاء الاصطناعي","AI"],["embedded","الأنظمة المدمجة","Embedded"],["technical","التقني","Technical"],["media","الميديا","Media"],["organization","التنظيم","Organization"],["finance","الإدارة والمالية","Administration & finance"]];
const priorities = [["normal","عادية","Normal"],["important","مهمة","Important"],["urgent","عاجلة","Urgent"]];
const statuses: Record<string, [string,string]> = {received:["تم الاستلام","Received"],review:["قيد المراجعة","Under review"],progress:["جارٍ الحل","In progress"],resolved:["تم الحل","Resolved"],closed:["مغلقة","Closed"]};
async function request(fn:string, body:unknown):Promise<Result>{
  const res=await fetch(SUPABASE_URL+"/rest/v1/rpc/"+fn,{method:"POST",headers:{apikey:SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store",referrerPolicy:"no-referrer"});
  if(!res.ok) throw new Error("Request failed");
  return await res.json() as Result;
}
export function ComplaintsForm({locale}:{locale:Locale}){
  const ar=locale==="ar";
  const tr=(a:string,b:string)=>ar?a:b;
  const [anonymous,setAnonymous]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [code,setCode]=useState("");
  const [lookup,setLookup]=useState("");
  const [checking,setChecking]=useState(false);
  const [status,setStatus]=useState<Result|null>(null);
  const [lookupError,setLookupError]=useState("");
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); if(busy)return;
    const data=new FormData(e.currentTarget);
    const val=(k:string)=>String(data.get(k)??"").trim();
    setBusy(true);setError("");
    try{
      const r=await request("submit_confidential_complaint",{p:{locale,anonymous,kind:val("kind"),department:val("department"),priority:val("priority"),subject:val("subject"),details:val("details"),solution:val("solution"),name:anonymous?"":val("name"),contact:anonymous?"":val("contact"),consent:data.has("consent")}});
      if(!r.ok||!r.code){setError(r.error==="rate_limited"?tr("حاول بعد شوية.","Please try again later."):tr("لم يتم إرسال البلاغ. راجع البيانات وحاول مرة أخرى.","Report not sent. Check the fields and try again."));return;}
      setCode(r.code);setLookup(r.code);setStatus(null);setLookupError("");
    }catch{setError(tr("لم يتم الإرسال. حاول لاحقًا.","Not submitted. Please try again later."));}finally{setBusy(false);}
  }
  async function check(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); if(checking)return;setChecking(true);setStatus(null);setLookupError("");
    try{
      const r=await request("confidential_complaint_status",{p_code:lookup.trim()});
      if(!r.ok||!r.status){setLookupError(tr("الكود غير متاح أو غير صحيح. حاول لاحقًا.","Code not found or unavailable. Try again later."));return;}
      setStatus(r);
    }catch{setLookupError(tr("تعذر التحقق الآن.","Unable to check right now."));}finally{setChecking(false);}
  }
  return <div className="grid gap-8 lg:grid-cols-12">
    <div className="lg:col-span-8">
      {code ? <section className="frame grid gap-4 p-6" aria-live="polite">
        <h2 className="t-headline text-2xl text-chalk">{tr("تم استلام البلاغ","Report received")}</h2>
        <p className="text-mist">{tr("احتفظ بكود المتابعة في مكان آمن. أي شخص معه الكود يقدر يشوف الحالة والرد. مش هنقدر نسترجعه لك.","Keep your code somewhere safe. Anyone with it can check the status and reply. It cannot be recovered.")}</p>
        <code dir="ltr" className="break-all text-cyan" data-testid="complaint-code">{code}</code>
        <button type="button" className="btn" onClick={()=>{setCode("");setLookup("");setStatus(null);setLookupError("");setAnonymous(true);}}>{tr("بلاغ جديد","New report")}</button>
      </section>:<form onSubmit={submit} aria-label={tr("تقديم شكوى","Submit a complaint")} className="frame grid gap-5 p-5 sm:p-8" autoComplete="off">
        <h2 className="t-headline text-2xl text-chalk">{tr("قدّم بلاغك","Submit a report")}</h2>
        <fieldset className="grid gap-2"><legend className="mb-2 text-frost">{tr("طريقة التقديم","Reporting preference")}</legend>
          <label className="flex items-center gap-2"><input type="radio" name="identity" checked={anonymous} onChange={()=>setAnonymous(true)}/>{tr("بدون ذكر هويتي","Do not include my identity")}</label>
          <label className="flex items-center gap-2"><input type="radio" name="identity" checked={!anonymous} onChange={()=>setAnonymous(false)}/>{tr("باسمي","Include my identity")}</label>
        </fieldset>
        {!anonymous&&<div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr("الاسم","Name")} name="name"><Input name="name" maxLength={150} required /></Field>
          <Field label={tr("وسيلة تواصل (اختياري)","Contact method (optional)")} name="contact"><Input name="contact" maxLength={200}/></Field>
        </div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr("نوع البلاغ","Report type")} name="kind"><Select name="kind">{types.map(x=><option key={x[0]} value={x[0]}>{x[ar?1:2]}</option>)}</Select></Field>
          <Field label={tr("القسم المعني","Department")} name="department"><Select name="department">{departments.map(x=><option key={x[0]} value={x[0]}>{x[ar?1:2]}</option>)}</Select></Field>
        </div>
        <Field label={tr("الأولوية","Priority")} name="priority"><Select name="priority">{priorities.map(x=><option key={x[0]} value={x[0]}>{x[ar?1:2]}</option>)}</Select></Field>
        <Field label={tr("عنوان البلاغ","Subject")} name="subject"><Input name="subject" required minLength={3} maxLength={150}/></Field>
        <Field label={tr("تفاصيل البلاغ","Report details")} name="details" hint={tr("اذكر الوقائع فقط، وتجنب أي بيانات شخصية مش ضرورية.","Describe the facts and avoid unnecessary personal information.")}><Textarea name="details" required minLength={15} maxLength={5000} rows={6}/></Field>
        <Field label={tr("الحل المقترح (اختياري)","Suggested resolution (optional)")} name="solution"><Textarea name="solution" maxLength={2000} rows={3}/></Field>
        <label className="flex items-start gap-3 text-sm text-mist"><input required name="consent" type="checkbox" className="mt-1"/>{tr("أقر بأنني أقدم البلاغ بحسن نية وأن المعلومات صحيحة حسب علمي.","I am reporting in good faith and the information is accurate to the best of my knowledge.")}</label>
        <FormError message={error}/><button className="btn btn-primary" type="submit" disabled={busy}>{busy?tr("جاري الإرسال…","Sending…"):tr("إرسال البلاغ","Submit report")}</button>
      </form>}
    </div>
    <aside className="grid content-start gap-5 lg:col-span-4">
      <section className="frame grid gap-3 p-5"><h2 className="t-headline text-xl text-chalk">{tr("الخصوصية","Privacy")}</h2>
        <p className="text-sm text-mist">{tr("البلاغات مش بتظهر لباقي الأعضاء أو صندوق رسائل الفريق. المراجعة مخصصة لصاحب صلاحية المالك. اختيار عدم ذكر اسمك لا يمنع سجلات الأمان التقنية.","Reports are not shared with members or the general inbox. Review is restricted to the owner role. Omitting your name does not prevent technical security logs.")}</p>
        <p className="text-sm text-mist">{tr("لو البلاغ ضد المالك أو فيه خطر عاجل، تواصل مباشرة مع مسؤول محايد في الكلية أو الجهة المختصة. الفورم مش للطوارئ.","If the report concerns the owner or involves immediate danger, contact an impartial faculty official or the appropriate authority. This is not an emergency service.")}</p>
      </section>
      <form onSubmit={check} className="frame grid gap-3 p-5" aria-label={tr("متابعة البلاغ","Track report")}>
        <h2 className="t-headline text-xl text-chalk">{tr("تابع بلاغك","Track a report")}</h2>
        <Field label={tr("كود المتابعة السري","Private tracking code")} name="tracking"><Input name="tracking" dir="ltr" required maxLength={80} value={lookup} onChange={e=>{setLookup(e.target.value);setStatus(null);setLookupError("");}}/></Field>
        <button className="btn" type="submit" disabled={checking}>{checking?tr("جاري التحقق…","Checking…"):tr("عرض الحالة","Check status")}</button>
        <FormError message={lookupError}/>
        {status?.status&&<div aria-live="polite" className="grid gap-2 text-sm"><strong className="text-cyan">{statuses[status.status]?.[ar?0:1]??status.status}</strong>{status.reply&&<p className="whitespace-pre-wrap break-words text-mist">{status.reply}</p>}</div>}
      </form>
    </aside>
  </div>;
}
