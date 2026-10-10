-- Robotex: the team registers each accepted delegate on the expo's own visitor page from the app
-- (their details ready to copy), and marks them done; the badge reaches the delegate's email.
update public.forms
   set delegation = delegation || jsonb_build_object('register_url', 'https://expo.ndtcorner.com/visitor'),
       accepted_ar = 'اتقبلت واتسجلت في وفد BuildX HUE لمعرض Robotex 🎉 مش محتاج تسجّل في أي موقع: الفريق بيسجّلك وبيبعت كشف الوفد لإدارة المعرض، والبادج بيوصلك على إيميلك. خد سكرين شوت لتصريح الوفد اللي تحت، وميعاد ومكان التجمع هيوصلوك على واتساب.'
 where slug = 'robotex-2026' and delegation is not null and not delegation ? 'register_url';
