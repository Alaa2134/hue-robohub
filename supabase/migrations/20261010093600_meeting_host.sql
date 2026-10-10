-- Whoever opens or closes a meeting is there: counted present (never marked absent at their own meeting).
select private.patch_function('public.staff_meeting_open(uuid)',
  $p$  return jsonb_build_object('ok', true, 'code', v_code);$p$,
  $p$  insert into public.sector_meeting_attendance (meeting_id, staff_id, status, method)
  select p_id, auth.uid(), 'present', 'manual' where auth.uid() = any(private.meeting_invitees(p_id))
  on conflict (meeting_id, staff_id) do nothing;
  return jsonb_build_object('ok', true, 'code', v_code);$p$);
select private.patch_function('public.staff_meeting_close(uuid, text)',
  $p$  v_absent := array(select u from unnest(private.meeting_invitees(p_id)) as u
                     where not exists$p$,
  $p$  v_absent := array(select u from unnest(private.meeting_invitees(p_id)) as u
                     where u <> auth.uid() and not exists$p$);
