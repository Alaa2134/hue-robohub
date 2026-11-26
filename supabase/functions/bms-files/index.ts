import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const origins=["https://buildxhue.com","https://www.buildxhue.com","https://localhost","capacitor://localhost","http://localhost:4173"];
Deno.serve(async(req)=>{
 const origin=req.headers.get("origin")??"";
 const headers={"Access-Control-Allow-Origin":origins.includes(origin)?origin:origins[0],"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Vary":"Origin"};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==="OPTIONS")return new Response(null,{headers});
 if(req.method!=="POST")return reply({error:"method"},405);
 try{
  const p=await req.json(),url=Deno.env.get("SUPABASE_URL")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin=createClient(url,key,{auth:{persistSession:false}});
  if(p.op==="upload"){
   if(typeof p.token!=="string"||!/^[0-9a-f]{64}$/.test(p.token)||typeof p.task!=="string"||!/^[0-9a-f-]{36}$/i.test(p.task)||typeof p.name!=="string"||!Number.isSafeInteger(p.size))return reply({error:"invalid"},400);
   const {data,error}=await admin.rpc("bms_upload_ticket",{p_token:p.token,p_task:p.task,p_name:p.name,p_size:p.size});
   if(error||!data?.path)return reply({error:"Upload not authorized or limit reached"},403);
   const signed=await admin.storage.from("bms-submissions").createSignedUploadUrl(data.path);
   if(signed.error||!signed.data)return reply({error:"Could not prepare upload"},500);
   return reply({path:data.path,token:signed.data.token});
  }
  if(p.op==="download"){
   if(typeof p.path!=="string"||p.path.length>200)return reply({error:"invalid"},400);
   const bearer=req.headers.get("authorization");
   const user=createClient(url,anon,{auth:{persistSession:false},global:{headers:bearer?{Authorization:bearer}:{}}});
   const {data,error}=await user.rpc("bms_file_access",{p_path:p.path,p_token:typeof p.token==="string"?p.token:null});
   if(error||data!==true)return reply({error:"not allowed"},403);
   const signed=await admin.storage.from("bms-submissions").createSignedUrl(p.path,300,{download:true});
   if(signed.error||!signed.data)return reply({error:"File unavailable"},404);
   return reply({url:signed.data.signedUrl});
  }
  return reply({error:"invalid"},400);
 }catch{return reply({error:"Request failed"},400);}
});
