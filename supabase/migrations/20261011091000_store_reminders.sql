-- Baqloz reminds about the store too: my loans due soon or late, and for the keepers the borrow
-- requests waiting and the items running low.
select private.patch_function('public.staff_reminders()',
  $p$        select jsonb_build_object('kind', 'unread',$p$,
  $p$        -- My loans from the store: late, or due in the next day.
        select jsonb_build_object('kind', case when l.due_at < now() then 'loan_overdue' else 'loan_due' end,
                 'rank', case when l.due_at < now() then 1 else 3 end, 'id', l.id, 'title', i.name, 'count', l.quantity, 'at', l.due_at,
                 'to', '/staff/inventory')
          from public.inventory_loans l join public.inventory_items i on i.id = l.item_id
         where l.staff_id = v_me and l.status = 'out' and l.due_at < now() + interval '1 day'
        union all
        -- Keepers: borrow requests waiting, and items running low.
        select jsonb_build_object('kind', 'store_request', 'rank', 5, 'count', count(*), 'at', min(r.created_at), 'to', '/staff/inventory?tab=requests')
          from public.inventory_requests r where r.status = 'pending' and private.keeps_store() having count(*) > 0
        union all
        select jsonb_build_object('kind', 'low_stock', 'rank', 7, 'count', count(*), 'title', min(i.name), 'at', max(i.low_notified_at), 'to', '/staff/inventory?tab=low')
          from public.inventory_items i where i.low_notified_at is not null and not i.archived and private.keeps_store() having count(*) > 0
        union all
        select jsonb_build_object('kind', 'unread',$p$);
