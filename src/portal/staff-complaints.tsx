"use client";
import { useState } from "react";
import { sb, must, fmt } from "./core";
import { TopBar, Card, Button, Loading, ErrorBox, useAsync, toast } from "./ui";

type Report={id:string;created_at:string;anonymous:boolean;name:string|null;contact:string|null;kind:string;department:string;priority:string;subject:string;details:string;solution:string|null;status:string;reply:string|null;internal_note:string|null};
const states:Record<string,string>={received:"تم الاستلام",review:"قيد المراجعة",progress:"جارٍ الحل",resolved:"تم الحل",closed:"مغلقة"};
const labels:Record<string,string>={general:"عام",leadership:"الإدارة",hr:"HR",ai:"AI",embedded:"Embedded",technical:"التقني",media:"الميديا",organization:"التنظيم",finance:"المالية",normal:"عادية",important:"مهمة",urgent:"عاجلة",complaint:"شكوى",problem:"مشكلة",misconduct:"إساءة",suggestion:"اقتراح",other:"أخرى"};
export function ComplaintsScreen(){
  const {data,error,loading,reload}=useAsync(async()=>await sb().rpc("staff_confidential_complaints").then(must) as Report[],[]);
  const [filter,setFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [selected,setSelected]=useState<Report|null>(null);
  const [busy,setBusy]=useState(false);
  const list=(data??[]).filter(x=>(filter==="all"||x.status===filter)&&[x.subject,x.department,x.kind,labels[x.department]??""].some(v=>v.toLowerCase().includes(search.toLowerCase())));
  async function save(){
    if(!selected||busy)return;setBusy(true);
    try{
      const result=await sb().rpc("staff_update_confidential_complaint",{p_id:selected.id,p_status:selected.status,p_reply:selected.reply??"",p_note:selected.internal_note??""}).then(must) as {ok:boolean};
      if(!result.ok)throw new Error("Report not found");
      setSelected(null);reload();
    }catch(e){toast.error(e);}finally{setBusy(false);}
  }
  return <>
    <TopBar title="الشكاوى السرية" sub="صلاحية المالك فقط" back="/staff/more"/>
    <p className="mt-3 text-sm text-fog">لو فيه تضارب مصالح، ما تتولاش التحقيق وحوّل البلاغ لمسؤول جامعي محايد بطريقة آمنة. متشاركش التفاصيل مع غير المخولين.</p>
    <div className="my-4 grid grid-cols-2 gap-3">
      <Card><span className="text-fog text-sm">آخر 500 بلاغ</span><p className="text-xl text-chalk">{data?.length??"—"}</p></Card>
      <Card><span className="text-fog text-sm">قيد المتابعة</span><p className="text-xl text-chalk">{data?.filter(x=>!["resolved","closed"].includes(x.status)).length??"—"}</p></Card>
    </div>
    <div className="grid gap-2 sm:grid-cols-2"><input aria-label="بحث" className="rounded-lg bg-panel p-3 text-chalk" placeholder="بحث بالعنوان أو القسم" value={search} onChange={e=>setSearch(e.target.value)}/>
      <select aria-label="فلتر الحالة" className="rounded-lg bg-panel p-3 text-chalk" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">كل الحالات</option>{Object.entries(states).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
    {loading?<Loading/>:error?<ErrorBox error={error} retry={reload}/>:<div className="mt-4 grid gap-3">{!list.length&&<p className="text-fog">لا توجد بلاغات مطابقة</p>}{list.map(x=><Card key={x.id} className="grid gap-2"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="break-words text-chalk">{x.subject}</strong><span className="text-xs text-cyan">{states[x.status]}</span></div><p className="text-xs text-fog">{fmt.dateTime(x.created_at)} · {labels[x.priority]} · {labels[x.department]} · {x.anonymous?"بدون اسم":"باسم"}</p><Button onClick={()=>setSelected({...x})}>عرض البلاغ</Button></Card>)}</div>}
    {selected&&<Card className="mt-4 grid gap-4">
      <h2 className="text-lg font-semibold text-chalk">{selected.subject}</h2>
      <p className="text-sm text-fog">{selected.anonymous?"بدون اسم":[selected.name,selected.contact].filter(Boolean).join(" · ")} · {labels[selected.kind]}</p>
      <p className="whitespace-pre-wrap break-words text-chalk">{selected.details}</p>
      {selected.solution&&<p className="whitespace-pre-wrap break-words text-mist">الحل المقترح: {selected.solution}</p>}
      <label className="grid gap-1 text-sm">الحالة<select className="rounded-lg bg-panel p-3" value={selected.status} onChange={e=>setSelected({...selected,status:e.target.value})}>{Object.entries(states).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label className="grid gap-1 text-sm">رد يظهر لصاحب كود المتابعة فقط (بدون بيانات شخصية)<textarea className="rounded-lg bg-panel p-3" rows={4} maxLength={2000} value={selected.reply??""} onChange={e=>setSelected({...selected,reply:e.target.value})}/></label>
      <label className="grid gap-1 text-sm">ملاحظة داخلية لا تظهر لصاحب البلاغ<textarea className="rounded-lg bg-panel p-3" rows={4} maxLength={4000} value={selected.internal_note??""} onChange={e=>setSelected({...selected,internal_note:e.target.value})}/></label>
      <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void save()}>حفظ</Button><Button disabled={busy} onClick={()=>setSelected(null)}>إغلاق</Button></div>
    </Card>}
  </>;
}
