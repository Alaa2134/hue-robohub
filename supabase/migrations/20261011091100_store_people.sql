-- The keepers pick who they lend to: the team and the active students (name, code and group only).
select private.patch_function('public.staff_inventory()',
  $p$    'keeps', v_keep,$p$,
  $p$    'keeps', v_keep,
    'staff', case when v_keep then coalesce((select jsonb_agg(jsonb_build_object('id', s.user_id, 'name', private.staff_name(s.user_id), 'title', s.title) order by s.full_name)
               from public.staff s where s.active), '[]'::jsonb) end,
    'students', case when v_keep then coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.full_name, 'code', st.code, 'group', st.group_name) order by st.full_name)
               from public.students st where st.active), '[]'::jsonb) end,$p$);
