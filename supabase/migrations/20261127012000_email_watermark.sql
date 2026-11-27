-- Adds a muted watermark made from the existing logo. Solid-color fallback remains for mail clients that block images.
CREATE OR REPLACE FUNCTION private.email_html_branded(p_subject text, p_text text, p_template text, p_unsub text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
 ar boolean := coalesce(p_subject,'')||coalesce(p_text,'') ~ '[؀-ۿ]';
 dir text := case when ar then 'rtl' else 'ltr' end;
 align text := case when ar then 'right' else 'left' end;
 lang text := case when ar then 'ar' else 'en' end;
 label text; accent text := '#087c98'; pale text := '#eaf7fb';
 body_html text := ''; ln text; item text; pos int; rest text; u text;
 cta text; cta_label text;
begin
 if p_template in ('application_accepted','form_accepted','event_registered','family_joined') then
  label:=case when ar then 'تأكيد وتسجيل' else 'CONFIRMED · REGISTRATION' end; accent:='#166534'; pale:='#edf8ef';
 elsif p_template in ('form_waitlist','join_open_waitlist','join_open_waitlist_en') then
  label:=case when ar then 'تحديث التسجيل' else 'REGISTRATION UPDATE' end;
 elsif p_template in ('application_rejected','form_rejected') then
  label:=case when ar then 'تحديث الطلب' else 'APPLICATION UPDATE' end; accent:='#475569'; pale:='#f1f5f9';
 elsif p_template in ('event_reminder','form_session_reminder','form_unpaid','application_interview_reminder','membership_expiring') then
  label:=case when ar then 'تذكير مهم' else 'IMPORTANT REMINDER' end; accent:='#92400e'; pale:='#fff7e6';
 elsif p_template in ('application_received','form_received','contact_received','application_next_steps') then
  label:=case when ar then 'متابعة الطلب' else 'APPLICATION & FOLLOW-UP' end;
 else label:=case when ar then 'رسالة من فريق BuildX' else 'BUILDX HUE · TEAM MESSAGE' end; end if;
 -- Render plain text, escaping all text and attribute values independently.
 foreach ln in array string_to_array(replace(coalesce(p_text,''),E'\r',''),E'\n') loop
  if btrim(ln)='' then body_html:=body_html||'<div style="height:12px;line-height:12px">&nbsp;</div>'; continue; end if;
  rest:=ln; item:='';
  loop
   u:=substring(rest from 'https?://[^[:space:]<>"'']+');
   if u is null then item:=item||private.email_escape(rest); exit; end if;
   pos:=strpos(rest,u);
   item:=item||private.email_escape(substr(rest,1,pos-1))||'<a href="'||private.email_escape(u)||'" style="color:#075e89;text-decoration:underline;word-break:break-all" dir="ltr">'||private.email_escape(u)||'</a>';
   if cta is null and u ~ '^https://buildxhue\.com/(ar/|en/|app/)' and u !~ '^https://buildxhue\.com/(ar|en)/unsubscribe/' then cta:=u; end if;
   rest:=substr(rest,pos+length(u));
  end loop;
  body_html:=body_html||'<div dir="auto" style="margin:0;line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word">'||item||'</div>';
 end loop;
 if cta is null then cta:='https://buildxhue.com/app/'; end if;
 cta_label:=case
  when cta ~ '/ticket/' then case when ar then 'عرض التذكرة' else 'View ticket' end
  when cta ~ '[?&]pass=' then case when ar then 'عرض تصريح الحضور' else 'View attendance pass' end
  when cta ~ '/status/|[?&]ref=' then case when ar then 'متابعة الطلب' else 'Track application' end
  when cta ~ '/join/' then case when ar then 'الانضمام إلى BuildX' else 'Join BuildX' end
  when cta='https://buildxhue.com/app/' then case when ar then 'فتح تطبيق BuildX' else 'Open BuildX App' end
  else case when ar then 'عرض التفاصيل' else 'View details' end end;
 return '<!doctype html><html lang="'||lang||'" dir="'||dir||'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>'||private.email_escape(p_subject)||'</title></head>'
 ||'<body style="margin:0;padding:0;background:#edf2f7;font-family:Tahoma,Arial,sans-serif;-webkit-text-size-adjust:100%;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">'||private.email_escape(left(coalesce(p_subject,''),160))||'</div>'
 ||'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#edf2f7"><tr><td align="center" style="padding:24px 10px">'
 ||'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #dbe3ed;border-radius:18px;overflow:hidden">'
 ||'<tr><td bgcolor="#0b1730" background="https://raw.githubusercontent.com/Alaa2134/hue-robohub/e3f35dc685a2d0f75f0fc351a5355637d9a93957/public/brand/email-watermark.png" style="padding:26px 24px;background-color:#0b1730;background-image:url(https://raw.githubusercontent.com/Alaa2134/hue-robohub/e3f35dc685a2d0f75f0fc351a5355637d9a93957/public/brand/email-watermark.png);background-repeat:no-repeat;background-position:72% center;background-size:150px 150px;"><table role="presentation" width="100%" dir="ltr" cellspacing="0" cellpadding="0"><tr><td width="64" valign="middle"><img src="https://buildxhue.com/brand/logo-badge-160.png" width="54" height="54" alt="BuildX HUE" style="display:block;border:0"></td><td valign="middle" align="left" style="color:#fff;font-size:23px;font-weight:bold;line-height:1.25">BuildX <span style="color:#42d5ef">HUE</span><br><span style="color:#c3d1e4;font-size:11px;font-weight:normal">Horus University · Egypt</span></td><td align="right" width="58"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#ffffff" style="padding:5px;border-radius:8px"><img src="https://buildxhue.com/brand/hue-logo.png" width="45" height="45" alt="Horus University" style="display:block;border:0"></td></tr></table></td></tr></table></td></tr>'
 ||'<tr><td height="4" bgcolor="#38cfe7" style="font-size:0;line-height:0">&nbsp;</td></tr>'
 ||'<tr><td dir="'||dir||'" align="'||align||'" style="padding:26px 24px 14px"><span style="display:inline-block;background:'||pale||';color:'||accent||';font-size:12px;font-weight:bold;padding:7px 12px;border-radius:6px">'||label||'</span><h1 dir="auto" style="font-size:24px;line-height:1.45;color:#101e36;margin:15px 0 0;font-weight:700;overflow-wrap:anywhere">'||private.email_escape(coalesce(nullif(p_subject,''),'BuildX HUE'))||'</h1></td></tr>'
 ||'<tr><td dir="'||dir||'" align="'||align||'" style="padding:4px 24px 24px;font-size:15px;color:#26374d;line-height:1.85">'||body_html||'</td></tr>'
 ||'<tr><td align="center" style="padding:0 24px 28px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#123d65" align="center" style="border-radius:9px"><a href="'||private.email_escape(cta)||'" style="display:inline-block;padding:14px 26px;color:#fff;font-size:15px;line-height:20px;font-weight:bold;text-decoration:none;border:1px solid #123d65;border-radius:9px">'||cta_label||'</a></td></tr></table></td></tr>'
 ||'<tr><td bgcolor="#f5f8fc" dir="'||dir||'" align="'||align||'" style="border-top:1px solid #e1e8f0;padding:21px 24px;color:#475569;font-size:12px;line-height:1.8"><strong style="font-size:14px;color:#15243b">BuildX HUE</strong><br>'
 ||case when ar then 'مجتمع طلابي للروبوتكس والأنظمة المدمجة والذكاء الاصطناعي · جامعة حورس' else 'Student community for Robotics, Embedded Systems &amp; AI · Horus University' end
 ||'<br><a href="https://buildxhue.com/" style="color:#075e89;text-decoration:underline">buildxhue.com</a> &nbsp;·&nbsp; <a href="https://www.instagram.com/buildx.hue/" style="color:#075e89;text-decoration:underline">Instagram</a>'
 ||case when p_unsub ~ '^https://buildxhue\.com/(ar|en)/unsubscribe/\?' then '<br><a href="'||private.email_escape(p_unsub)||'" style="color:#475569;text-decoration:underline">'||case when ar then 'إلغاء الاشتراك في الرسائل' else 'Unsubscribe' end||'</a>' else '' end
 ||'</td></tr></table></td></tr></table></body></html>';
end $function$
;
