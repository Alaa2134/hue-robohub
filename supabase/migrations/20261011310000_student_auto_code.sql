-- Adding a student needs only a name: when no student code is given, one is made (BX1001, BX1002…),
-- skipping any code or card barcode already in use.
create sequence if not exists private.student_code_seq start 1001;

alter table public.students alter column code set default '';

create or replace function private.students_normalize()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' and btrim(coalesce(new.code, '')) = '' then
    loop
      new.code := 'BX' || nextval('private.student_code_seq');
      exit when not exists (
        select 1 from public.students
        where code_key = private.code_key(new.code) or barcode_key = private.code_key(new.code)
      );
    end loop;
  end if;
  new.code := btrim(regexp_replace(new.code, '\s+', ' ', 'g'));
  new.code_key := private.code_key(new.code);
  if new.code_key is null then
    raise exception 'invalid_code' using errcode = '22023', detail = 'A student code needs at least one letter or digit.';
  end if;
  new.barcode := nullif(btrim(coalesce(new.barcode, '')), '');
  new.barcode_key := private.code_key(new.barcode);
  if new.barcode_key = new.code_key then
    new.barcode := null;
    new.barcode_key := null;
  end if;
  if new.barcode_key is not null and exists (select 1 from public.students where code_key = new.barcode_key and id <> new.id) then
    raise exception 'barcode_taken' using errcode = '23505';
  end if;
  if exists (select 1 from public.students where barcode_key = new.code_key and id <> new.id) then
    raise exception 'code_taken' using errcode = '23505';
  end if;
  new.full_name := btrim(regexp_replace(new.full_name, '\s+', ' ', 'g'));
  new.group_name := btrim(regexp_replace(coalesce(new.group_name, ''), '\s+', ' ', 'g'));
  new.phone := nullif(btrim(coalesce(new.phone, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $function$;
