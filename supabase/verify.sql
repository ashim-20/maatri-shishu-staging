-- Read-only schema/grant checks for the SQL Editor after applying the migration.
-- Every row must report ok=true. No patient records or credentials are returned.
-- This does not replace testing RLS with separately scoped staff accounts.
with expected_tables(name) as (
  select unnest(array[
    'municipalities','health_facilities','staff_profiles','staff_scopes',
    'mothers','pregnancies','births','children','care_events','event_reviews',
    'appointments','follow_ups','attempts','sessions','consents','schedules',
    'reviews','audit_events','record_revisions','sync_operations'
  ])
), expected_rpcs(signature) as (
  select unnest(array[
    'public.apply_operation(jsonb)', 'public.apply_operations(jsonb)',
    'public.load_workspace()', 'public.record_access(text,text,uuid)',
    'public.record_access_event(jsonb)'
  ])
), internal_helpers(signature) as (
  select unnest(array[
    'public.require_record(text,uuid,uuid)',
    'public.validate_record_payload(text,jsonb)',
    'public.entity_json(text,jsonb)'
  ])
)
select 'RLS enabled: ' || t.name as check_name,
       coalesce(c.relrowsecurity, false) as ok
from expected_tables t
left join pg_class c on c.oid = to_regclass('public.' || t.name)
union all
select 'Direct writes denied: ' || t.name,
       coalesce(
         not has_table_privilege('anon', to_regclass('public.' || t.name), 'INSERT, UPDATE, DELETE, TRUNCATE')
         and not has_table_privilege('authenticated', to_regclass('public.' || t.name), 'INSERT, UPDATE, DELETE, TRUNCATE'),
         false
       )
from expected_tables t
union all
select 'Authenticated RPC only: ' || r.signature,
       coalesce(
         not has_function_privilege('anon', to_regprocedure(r.signature), 'EXECUTE')
         and has_function_privilege('authenticated', to_regprocedure(r.signature), 'EXECUTE'),
         false
       )
from expected_rpcs r
union all
select 'Internal helper protected: ' || h.signature,
       coalesce(
         not has_function_privilege('anon', to_regprocedure(h.signature), 'EXECUTE')
         and not has_function_privilege('authenticated', to_regprocedure(h.signature), 'EXECUTE'),
         false
       )
from internal_helpers h
order by check_name;
