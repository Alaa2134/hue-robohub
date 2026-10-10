-- Saved WhatsApp messages: the team keeps the ones it sends often (acceptance, reminders, congratulations)
-- and picks one with a tap. Whoever has "whatsapp" (or sees it) reads them; full "whatsapp" saves and
-- retires them. A few to start with.

create table if not exists public.whatsapp_snippets (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 60),
  body text not null check (char_length(body) between 2 and 4096),
  archived boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.whatsapp_snippets enable row level security;
create policy whatsapp_snippets_select on public.whatsapp_snippets for select to authenticated
  using ((select private.can_read('whatsapp')));
create policy whatsapp_snippets_insert on public.whatsapp_snippets for insert to authenticated
  with check ((select private.can('whatsapp')));
create policy whatsapp_snippets_update on public.whatsapp_snippets for update to authenticated
  using ((select private.can('whatsapp'))) with check ((select private.can('whatsapp')));
revoke all on public.whatsapp_snippets from anon;
grant select, insert, update on public.whatsapp_snippets to authenticated;

insert into public.whatsapp_snippets (title, body, created_by) values
  ('القبول', '{hi} {name} 🎉' || chr(10) || 'اتقبلت في BuildX HUE! هنبعتلك تفاصيل أول لقاء قريب. أهلًا بيك معانا 💙', null),
  ('تذكير بمحاضرة', '{hi} {name} 👋' || chr(10) || 'بنفكرك إن المحاضرة الجاية بكرة إن شاء الله. متتأخرش، مستنيينك!', null),
  ('تذكير بفعالية', '{hi} {name}' || chr(10) || 'الفعالية بكرة! التجمع في المكان والمعاد اللي اتبعتوا، وهات الكارنيه بتاعك (الـ QR من التطبيق).', null),
  ('وحشتنا', '{hi} {name} 👋' || chr(10) || 'وحشتنا في السيشنز الأخيرة! كله تمام؟ لو فيه حاجة واقفة قدامك قولّنا نساعدك.', null),
  ('تهنئة', '{hi} {name} 🏆' || chr(10) || 'مبروك! فخورين بيك جدًا، كمّل كده 💪', null);
