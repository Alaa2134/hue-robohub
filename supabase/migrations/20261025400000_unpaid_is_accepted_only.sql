-- A form's fee is owed once someone is accepted: the automatic "you haven't paid yet" WhatsApp
-- reminder goes only to accepted people (not the waiting list or new ones), counted from when they
-- were accepted. The rest of private.wa_auto_tick is left exactly as it is.
do $mig$
declare
  d text := pg_get_functiondef('private.wa_auto_tick(boolean)'::regprocedure);
  a1 text := 'floor(extract(epoch from now() - r.created_at) / 172800)::int as round';
  b1 text := 'floor(extract(epoch from now() - coalesce(r.accepted_at, r.created_at)) / 172800)::int as round';
  a2 text := 'and r.paid_at is null and r.status <> ''rejected'' and r.phone is not null';
  b2 text := 'and r.paid_at is null and r.status = ''accepted'' and r.phone is not null';
  a3 text := 'and r.created_at >= v_since and r.created_at < now() - interval ''2 days'' and r.created_at > now() - interval ''8 days'' loop';
  b3 text := 'and r.created_at >= v_since and coalesce(r.accepted_at, r.created_at) < now() - interval ''2 days'' and coalesce(r.accepted_at, r.created_at) > now() - interval ''8 days'' loop';
begin
  if position(a1 in d) = 0 or position(a2 in d) = 0 or position(a3 in d) = 0 then
    raise exception 'private.wa_auto_tick is not the expected version; update this migration';
  end if;
  execute replace(replace(replace(d, a1, b1), a2, b2), a3, b3);
end
$mig$;
