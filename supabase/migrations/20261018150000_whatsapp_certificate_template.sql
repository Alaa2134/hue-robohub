-- Meta refused bx_certificate_ready_v5 as INCORRECT_CATEGORY: «كود التحقق» with a code reads like a
-- login code. The certificate message no longer carries the code.

insert into private.wa_templates (name, category, moments, example, body) values
('bx_certificate_ready_v6', 'UTILITY', '{certificate_issued}', '{أحمد,"Embedded Systems Bootcamp"}',
'مبروك يا {{1}} 🎓 شهادتك «{{2}}» من BuildX HUE جاهزة. تقدر تشوفها وتنزّلها من التطبيق، وتقدر تشاركها وأي حد يتأكد منها من buildxhue.com/ar/verify')
on conflict (name) do nothing;

update private.wa_templates set moments = '{}' where name = 'bx_certificate_ready_v5';

update private.wa_auto_rules set template = 'bx_certificate_ready_v6', alts = '{}' where key = 'certificate_issued';

select private.wa_templates_submit();
