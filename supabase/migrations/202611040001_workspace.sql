-- Maatri-Shishu: scoped record storage, immutable care history and atomic sync.
-- All application writes go through apply_operation; no service key is used by Next.js.
begin;

create table public.municipalities (id uuid primary key default gen_random_uuid(), name text not null);
create table public.health_facilities (id uuid primary key default gen_random_uuid(), municipality_id uuid not null references public.municipalities(id), name text not null);
create table public.staff_profiles (
  id uuid primary key references auth.users(id), full_name text not null,
  role text not null check (role in ('fchv','health_worker','supervisor','municipality_admin','clinical_approver','system_admin')),
  facility_id uuid not null references public.health_facilities(id), active boolean not null default true
);
create table public.staff_scopes (
  user_id uuid not null references public.staff_profiles(id), facility_id uuid not null references public.health_facilities(id),
  ward_number integer not null check (ward_number between 1 and 99), primary key(user_id,facility_id,ward_number)
);

create function public.staff_role() returns text language sql stable security definer set search_path = '' as $$
  select role from public.staff_profiles where id=auth.uid() and active;
$$;
create function public.can_access_record(target_facility uuid, target_ward integer, record_type text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.staff_profiles p join public.staff_scopes s on s.user_id=p.id
    where p.id=auth.uid() and p.active and p.facility_id=target_facility and s.facility_id=target_facility and s.ward_number=target_ward
    and (record_type='schedules' or p.role in ('fchv','health_worker','supervisor')));
$$;
create function public.is_iso_date(value text) returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  return to_char(value::date,'YYYY-MM-DD')=value;
exception when others then return false;
end;
$$;

-- Domain-specific tables share a versioned envelope. Generated foreign keys below
-- make relationships relational; the typed JSON payload is validated by both RPC and Zod.
do $$ declare entity_name text; begin
  foreach entity_name in array array['mothers','pregnancies','births','children','care_events','event_reviews','appointments','follow_ups','attempts','sessions','consents','schedules','reviews'] loop
    execute format('create table public.%I (
      id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.health_facilities(id),
      ward_number integer not null check(ward_number between 1 and 99),
      data jsonb not null check(jsonb_typeof(data)=''object'' and octet_length(data::text)<=65536),
      version integer not null default 1 check(version>0), created_by uuid not null references auth.users(id),
      created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp())',entity_name);
    execute format('create index %I on public.%I(facility_id,ward_number,updated_at,id)',entity_name||'_scope_idx',entity_name);
    execute format('alter table public.%I enable row level security',entity_name);
    execute format('create policy %I on public.%I for select to authenticated using(public.can_access_record(facility_id,ward_number,%L))',entity_name||'_scoped_read',entity_name,entity_name);
    execute format('grant select on public.%I to authenticated',entity_name);
    execute format('revoke insert,update,delete,truncate on public.%I from anon,authenticated',entity_name);
  end loop;
end $$;
drop policy schedules_scoped_read on public.schedules;
create policy schedules_scoped_read on public.schedules for select to authenticated using(
  public.can_access_record(facility_id,ward_number,'schedules') and
  ((data->>'status'='active' and coalesce((data->>'testOnly')::boolean,false)=false) or public.staff_role() in ('clinical_approver','municipality_admin','system_admin'))
);

alter table public.pregnancies add column mother_id uuid generated always as ((data->>'motherId')::uuid) stored references public.mothers(id);
alter table public.births add column mother_id uuid generated always as ((data->>'motherId')::uuid) stored references public.mothers(id);
alter table public.births add column pregnancy_id uuid generated always as ((data->>'pregnancyId')::uuid) stored references public.pregnancies(id);
alter table public.children add column mother_id uuid generated always as ((data->>'motherId')::uuid) stored references public.mothers(id);
alter table public.children add column birth_id uuid generated always as ((data->>'birthId')::uuid) stored references public.births(id);
alter table public.children add column schedule_id uuid generated always as ((data->>'scheduleId')::uuid) stored references public.schedules(id);
alter table public.care_events add column pregnancy_id uuid generated always as ((data->>'pregnancyId')::uuid) stored references public.pregnancies(id);
alter table public.care_events add column schedule_id uuid generated always as ((data->>'scheduleId')::uuid) stored references public.schedules(id);
alter table public.care_events add column supersedes_id uuid generated always as ((data->>'supersedesId')::uuid) stored references public.care_events(id);
create unique index care_events_one_correction on public.care_events(supersedes_id) where supersedes_id is not null;
alter table public.event_reviews add column event_id uuid generated always as ((data->>'eventId')::uuid) stored references public.care_events(id);
alter table public.attempts add column task_id uuid generated always as ((data->>'taskId')::uuid) stored references public.follow_ups(id);
alter table public.follow_ups add column assignee_id uuid generated always as ((data->>'assigneeId')::uuid) stored references public.staff_profiles(id);
alter table public.follow_ups add column completion_event_id uuid generated always as ((data->>'completionEventId')::uuid) stored references public.care_events(id);

do $$ declare entity_name text; begin
  foreach entity_name in array array['care_events','appointments','follow_ups','consents','reviews'] loop
    execute format('alter table public.%I add column subject_mother_id uuid generated always as (case when data->>''subjectType''=''mother'' then (data->>''subjectId'')::uuid end) stored references public.mothers(id)',entity_name);
    execute format('alter table public.%I add column subject_child_id uuid generated always as (case when data->>''subjectType''=''child'' then (data->>''subjectId'')::uuid end) stored references public.children(id)',entity_name);
    execute format('alter table public.%I add constraint %I check((subject_mother_id is not null)::integer+(subject_child_id is not null)::integer=1)',entity_name,entity_name||'_one_subject');
  end loop;
end $$;

create table public.audit_events (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id), action text not null,
  entity_type text not null, entity_id uuid not null, facility_id uuid not null references public.health_facilities(id), ward_number integer,
  occurred_at timestamptz not null default clock_timestamp(), safe_summary jsonb not null default '{}'::jsonb
);
create table public.record_revisions (
  id uuid primary key default gen_random_uuid(), record_type text not null, record_id uuid not null, version integer not null,
  facility_id uuid not null references public.health_facilities(id), ward_number integer not null,
  data jsonb not null, actor_id uuid not null references auth.users(id), occurred_at timestamptz not null default clock_timestamp(),
  unique(record_type,record_id,version)
);
create table public.sync_operations (
  user_id uuid not null references auth.users(id), operation_id uuid not null, request jsonb not null,
  result jsonb not null, received_at timestamptz not null default clock_timestamp(), primary key(user_id,operation_id)
);
alter table public.audit_events enable row level security;
alter table public.record_revisions enable row level security;
alter table public.sync_operations enable row level security;
create policy audit_scoped_read on public.audit_events for select to authenticated using(
  public.staff_role() is not null and (actor_id=auth.uid() or (ward_number is not null and public.staff_role()='supervisor' and public.can_access_record(facility_id,ward_number,entity_type)))
);
create policy revisions_scoped_read on public.record_revisions for select to authenticated using(public.can_access_record(facility_id,ward_number,record_type));
grant select on public.audit_events,public.record_revisions to authenticated;
revoke all on public.sync_operations from anon,authenticated;
revoke insert,update,delete,truncate on public.audit_events,public.record_revisions from anon,authenticated;

alter table public.municipalities enable row level security;
alter table public.health_facilities enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.staff_scopes enable row level security;
create policy own_profile on public.staff_profiles for select to authenticated using(id=auth.uid());
create policy own_scopes on public.staff_scopes for select to authenticated using(user_id=auth.uid());
create policy assigned_facility on public.health_facilities for select to authenticated using(exists(select 1 from public.staff_profiles p where p.id=auth.uid() and p.facility_id=health_facilities.id and p.active));
grant select on public.staff_profiles,public.staff_scopes,public.health_facilities to authenticated;
revoke insert,update,delete,truncate on public.staff_profiles,public.staff_scopes,public.health_facilities,public.municipalities from anon,authenticated;
grant all on all tables in schema public to service_role;

create function public.protect_immutable() returns trigger language plpgsql set search_path = '' as $$
begin raise exception using errcode='42501', message='Immutable history cannot be changed or deleted.'; end;
$$;
do $$ declare entity_name text; begin
  foreach entity_name in array array['care_events','event_reviews','attempts','consents','births','audit_events','record_revisions','sync_operations'] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.protect_immutable()',entity_name||'_immutable',entity_name);
  end loop;
end $$;

create function public.require_record(record_type text, record_id uuid, target_facility uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if record_type not in ('mothers','pregnancies','births','children','care_events','event_reviews','appointments','follow_ups','attempts','sessions','consents','schedules','reviews') then raise exception using errcode='22023',message='Unsupported record type.'; end if;
  execute format('select to_jsonb(r) from public.%I r where id=$1',record_type) into result using record_id;
  if result is null or (result->>'facility_id')::uuid<>target_facility or not public.can_access_record((result->>'facility_id')::uuid,(result->>'ward_number')::integer,record_type) then
    raise exception using errcode='42501',message='Linked record is outside the current assignment.';
  end if;
  return result;
end;
$$;
-- Internal helper must not become a direct data access endpoint.
revoke all on function public.require_record(text,uuid,uuid) from public,anon,authenticated;

create function public.validate_record_payload(entity_type text, payload jsonb) returns void language plpgsql set search_path = '' as $$
declare required_fields text[]; field_name text; rule jsonb;
begin
  if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>65536 then raise exception using errcode='22023',message='Invalid record payload.'; end if;
  required_fields := case entity_type
    when 'mothers' then array['name','reference','settlement','language','status','consent']
    when 'pregnancies' then array['motherId','dateSource','status']
    when 'births' then array['source']
    when 'children' then array['name','reference','settlement','dobSource','sex','status','consent']
    when 'care_events' then array['subjectId','subjectType','kind','date','source','verified']
    when 'event_reviews' then array['eventId','decision','reason']
    when 'appointments' then array['subjectId','subjectType','date','type']
    when 'follow_ups' then array['subjectId','subjectType','dueDate','category','reason','assigneeId','status']
    when 'attempts' then array['taskId','date','channel','outcome']
    when 'sessions' then array['title','date','startTime','location','service','status']
    when 'consents' then array['subjectId','subjectType','consent','reason']
    when 'schedules' then array['name','source','authority','effectiveFrom','status','testOnly','doses']
    when 'reviews' then array['subjectId','subjectType','category','status','reason'] else null end;
  if required_fields is null then raise exception using errcode='22023',message='Unsupported record type.'; end if;
  foreach field_name in array required_fields loop
    if not(payload ? field_name) or payload->field_name='null'::jsonb or (jsonb_typeof(payload->field_name)='string' and length(trim(payload->>field_name))=0) then raise exception using errcode='22023',message='Required field is missing.'; end if;
  end loop;
  foreach field_name in array array['date','dueDate','dob','lmp','edd','effectiveFrom','effectiveTo','nextDate'] loop
    if payload->>field_name is not null and not public.is_iso_date(payload->>field_name) then raise exception using errcode='22023',message='Invalid calendar date.'; end if;
  end loop;
  if payload ? 'note' and length(payload->>'note')>500 then raise exception using errcode='22023',message='Note is too long.'; end if;
  if payload ? 'subjectType' and payload->>'subjectType' not in ('mother','child') then raise exception using errcode='22023',message='Invalid subject.'; end if;
  if entity_type in ('mothers','children','consents') and (jsonb_typeof(payload->'consent')<>'object' or coalesce(payload->'consent'->>'status','') not in ('given','declined','withdrawn') or coalesce(payload->'consent'->>'language','') not in ('en','ne','bho') or coalesce(payload->'consent'->>'method','') not in ('verbal','written')) then raise exception using errcode='22023',message='Invalid consent record.'; end if;
  if entity_type='mothers' and (payload->>'status' not in ('pregnant','postnatal','inactive','moved') or payload->>'language' not in ('en','ne','bho') or length(payload->>'name')>120 or (payload->>'age' is not null and (payload->>'age')::integer not between 10 and 100)) then raise exception using errcode='22023',message='Invalid mother fields.'; end if;
  if entity_type='children' and (payload->>'status' not in ('active','moved','deceased') or payload->>'dobSource' not in ('confirmed','approximate','unknown') or payload->>'sex' not in ('female','male','not_recorded')) then raise exception using errcode='22023',message='Invalid child fields.'; end if;
  if entity_type='pregnancies' and (payload->>'status' not in ('active','postnatal','closed') or payload->>'dateSource' not in ('provider','card','reported','unknown')) then raise exception using errcode='22023',message='Invalid pregnancy fields.'; end if;
  if entity_type='births' and payload->>'source' not in ('provider','card','reported','unknown') then raise exception using errcode='22023',message='Invalid birth source.'; end if;
  if entity_type='care_events' and (payload->>'kind' not in ('anc','pnc_mother','pnc_child','td','vaccination') or payload->>'source' not in ('provider_administered','card_transcription','caregiver_reported') or jsonb_typeof(payload->'verified')<>'boolean') then raise exception using errcode='22023',message='Invalid care event fields.'; end if;
  if entity_type='event_reviews' and (payload->>'decision' not in ('verified','rejected') or length(trim(payload->>'reason'))<3) then raise exception using errcode='22023',message='Invalid verification decision.'; end if;
  if entity_type='appointments' and payload->>'type' not in ('anc','pnc','vaccination','other') then raise exception using errcode='22023',message='Invalid appointment type.'; end if;
  if entity_type='follow_ups' and (payload->>'category' not in ('anc','pnc','vaccination','general') or payload->>'status' not in ('open','closed')) then raise exception using errcode='22023',message='Invalid follow-up fields.'; end if;
  if entity_type='attempts' and (payload->>'channel' not in ('home_visit','phone','health_post') or payload->>'outcome' not in ('plans_to_attend','attended_elsewhere','card_unavailable','temporarily_unavailable','moved','unable_to_contact','declines','session_postponed','service_unavailable','referred','other')) then raise exception using errcode='22023',message='Invalid follow-up outcome.'; end if;
  if entity_type='sessions' and (payload->>'status' not in ('scheduled','confirmed','cancelled') or payload->>'service' not in ('immunization','anc_pnc','combined') or payload->>'startTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception using errcode='22023',message='Invalid session fields.'; end if;
  if entity_type='reviews' and (payload->>'category' not in ('duplicate','uncertain_dob','transfer','correction') or payload->>'status' not in ('open','resolved') or (payload->>'status'='resolved' and coalesce(length(trim(payload->>'resolution')),0)<3)) then raise exception using errcode='22023',message='Invalid review resolution.'; end if;
  if entity_type='schedules' then
    if jsonb_typeof(payload->'testOnly')<>'boolean' or payload->>'status' not in ('draft','clinical_approved','active') or jsonb_typeof(payload->'doses')<>'array' or jsonb_array_length(payload->'doses') not between 1 and 100 or (payload->>'effectiveTo' is not null and payload->>'effectiveTo'<payload->>'effectiveFrom') then raise exception using errcode='22023',message='Invalid schedule metadata.'; end if;
    for rule in select jsonb_array_elements(payload->'doses') loop
      if coalesce(length(trim(rule->>'code')),0)=0 or coalesce(length(trim(rule->>'name')),0)=0 or coalesce(rule->>'unit','') not in ('days','weeks','months') or jsonb_typeof(rule->'age')<>'number' or (rule->>'age')::numeric<>trunc((rule->>'age')::numeric) or (rule->>'age')::integer not between 0 and 1200 then raise exception using errcode='22023',message='Invalid schedule dose rule.'; end if;
    end loop;
    if (select count(*)<>count(distinct r->>'code') from jsonb_array_elements(payload->'doses') r) then raise exception using errcode='22023',message='Duplicate dose codes.'; end if;
  end if;
end;
$$;
revoke all on function public.validate_record_payload(text,jsonb) from public,anon,authenticated;

create function public.entity_json(entity_type text, row_value jsonb) returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id',row_value->'id','type',entity_type,'data',row_value->'data','facilityId',row_value->'facility_id','wardId',row_value->'ward_number','version',row_value->'version','createdAt',row_value->'created_at','updatedAt',row_value->'updated_at','createdBy',row_value->'created_by');
$$;
revoke all on function public.entity_json(text,jsonb) from public,anon,authenticated;

create function public.apply_operation(operation_input jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); actor_role text; target_facility uuid; target_ward integer;
  op_uuid uuid; entity_id uuid; entity_type text; action_name text; payload jsonb;
  previous jsonb; changed jsonb; receipt public.sync_operations%rowtype; related jsonb; schedule_data jsonb;
  latest_review uuid; response jsonb; expected integer; source_kind text; subject_table text; completion_verified boolean;
begin
  select role,facility_id into actor_role,target_facility from public.staff_profiles where id=actor and active;
  if actor is null or actor_role is null then raise exception using errcode='42501',message='An active staff account is required.'; end if;
  op_uuid := (operation_input->>'id')::uuid; entity_id := (operation_input->>'entityId')::uuid;
  entity_type := operation_input->>'entityType'; action_name := operation_input->>'action'; payload := operation_input->'data';
  target_ward := (operation_input->>'wardId')::integer; expected := (operation_input->>'expectedVersion')::integer;
  if op_uuid is null or entity_id is null or coalesce(action_name,'') not in ('create','update','approve_clinical','activate') or expected is null or expected<0 then raise exception using errcode='22023',message='Invalid operation envelope.'; end if;
  if coalesce(entity_type,'') not in ('mothers','pregnancies','births','children','care_events','event_reviews','appointments','follow_ups','attempts','sessions','consents','schedules','reviews') then raise exception using errcode='22023',message='Unsupported record type.'; end if;
  if not public.can_access_record(target_facility,target_ward,entity_type) then raise exception using errcode='42501',message='Operation is outside the current assignment.'; end if;
  if entity_type='schedules' and actor_role not in ('clinical_approver','municipality_admin','system_admin') then raise exception using errcode='42501',message='Schedule administration is restricted.'; end if;
  if entity_type in ('event_reviews','appointments','sessions') and actor_role not in ('health_worker','supervisor') then raise exception using errcode='42501',message='A qualified health worker is required.'; end if;
  if entity_type='reviews' and action_name='update' and actor_role<>'supervisor' then raise exception using errcode='42501',message='A supervisor must resolve this review.'; end if;

  -- Serialize repeated operation IDs. Scope and role are checked before receipt replay.
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||op_uuid::text,0));
  select * into receipt from public.sync_operations where user_id=actor and operation_id=op_uuid;
  if found then
    if receipt.request<>operation_input then raise exception using errcode='40001',message='Operation identifier reused with another payload.'; end if;
    perform public.require_record(entity_type,entity_id,target_facility);
    return receipt.result || jsonb_build_object('duplicate',true);
  end if;
  execute format('select to_jsonb(r) from public.%I r where id=$1 for update',entity_type) into previous using entity_id;
  if previous is not null then
    perform public.require_record(entity_type,entity_id,target_facility);
    if (previous->>'ward_number')::integer<>target_ward then raise exception using errcode='42501',message='Record scope cannot be changed through a profile edit.'; end if;
  end if;
  if action_name='create' then
    if previous is not null or expected<>0 then raise exception using errcode='40001',message='Record already exists.'; end if;
  else
    if previous is null or (previous->>'version')::integer<>expected then raise exception using errcode='40001',message='Record version changed.'; end if;
    if entity_type in ('care_events','event_reviews','attempts','consents','births') then raise exception using errcode='42501',message='Append a new event instead of changing history.'; end if;
  end if;
  if entity_type='schedules' then
    if action_name='approve_clinical' then
      if actor_role<>'clinical_approver' or previous->'data'->>'status'<>'draft' then raise exception using errcode='42501',message='Clinical approval requires a draft and authorized reviewer.'; end if;
      payload := previous->'data' || jsonb_build_object('status','clinical_approved','clinicalApprover',actor);
    elsif action_name='activate' then
      if actor_role<>'municipality_admin' or previous->'data'->>'status'<>'clinical_approved' or previous->'data'->>'clinicalApprover' is null or previous->'data'->>'clinicalApprover'=actor::text then raise exception using errcode='42501',message='A separate programme approver is required.'; end if;
      if coalesce((previous->'data'->>'testOnly')::boolean,true) then raise exception using errcode='22023',message='Test fixtures cannot be activated.'; end if;
      payload := previous->'data' || jsonb_build_object('status','active','programmeApprover',actor);
    else
      if (previous is not null and previous->'data'->>'status'<>'draft') or coalesce(payload->>'status','')<>'draft' or payload->>'clinicalApprover' is not null or payload->>'programmeApprover' is not null then raise exception using errcode='42501',message='Approved versions are immutable; edits require an unapproved draft.'; end if;
    end if;
  elsif action_name not in ('create','update') then raise exception using errcode='22023',message='Action is only supported for schedules.';
  end if;
  perform public.validate_record_payload(entity_type,payload);
  if entity_type='reviews' and payload->>'status'='resolved' and actor_role<>'supervisor' then raise exception using errcode='42501',message='A supervisor must resolve this review.'; end if;
  if entity_type in ('mothers','children') then
    if action_name='create' and payload->'consent'->>'status'<>'given' then raise exception using errcode='22023',message='Consent is required for non-essential digital registration.'; end if;
    if action_name='update' and payload->'consent' is distinct from previous->'data'->'consent' then raise exception using errcode='22023',message='Consent changes must be appended to consent history.'; end if;
  end if;
  if entity_type in ('pregnancies','births','children') and payload->>'motherId' is not null then perform public.require_record('mothers',(payload->>'motherId')::uuid,target_facility); end if;
  if entity_type in ('births','care_events') and payload->>'pregnancyId' is not null then
    related := public.require_record('pregnancies',(payload->>'pregnancyId')::uuid,target_facility);
    if (entity_type='births' and payload->>'motherId' is distinct from related->'data'->>'motherId') or (entity_type='care_events' and payload->>'subjectType'='mother' and payload->>'subjectId'<>related->'data'->>'motherId') then raise exception using errcode='22023',message='Pregnancy belongs to a different mother.'; end if;
  end if;
  if entity_type='births' then
    if payload->>'date'>(now() at time zone 'Asia/Kathmandu')::date::text then raise exception using errcode='22023',message='Birth date cannot be in the future.'; end if;
    if coalesce(payload->>'time','') !~ '^$|^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception using errcode='22023',message='Invalid birth time.'; end if;
  end if;
  if entity_type='children' then
    if payload->>'dob'>(now() at time zone 'Asia/Kathmandu')::date::text then raise exception using errcode='22023',message='Birth date cannot be in the future.'; end if;
    if (payload->>'dobSource'='unknown') is distinct from (payload->>'dob' is null) then raise exception using errcode='22023',message='Unknown birth date must remain empty.'; end if;
    if payload->>'birthId' is not null then
      related := public.require_record('births',(payload->>'birthId')::uuid,target_facility);
      if related->'data'->>'motherId' is distinct from payload->>'motherId' then raise exception using errcode='22023',message='Birth and mother relationship do not match.'; end if;
    end if;
    if payload->>'scheduleId' is not null then
      related := public.require_record('schedules',(payload->>'scheduleId')::uuid,target_facility);
      if related->'data'->>'status'<>'active' or coalesce((related->'data'->>'testOnly')::boolean,true) then raise exception using errcode='22023',message='A clinically approved schedule is required.'; end if;
    end if;
    if actor_role='fchv' and action_name='update' and (
      payload->>'dob' is distinct from previous->'data'->>'dob' or payload->>'dobSource' is distinct from previous->'data'->>'dobSource' or
      payload->>'motherId' is distinct from previous->'data'->>'motherId' or payload->>'birthId' is distinct from previous->'data'->>'birthId' or payload->>'scheduleId' is distinct from previous->'data'->>'scheduleId'
    ) then raise exception using errcode='42501',message='A health worker must review birth-date and relationship corrections.'; end if;
    if action_name='update' and (
      payload->>'dob' is distinct from previous->'data'->>'dob' or payload->>'dobSource' is distinct from previous->'data'->>'dobSource' or
      payload->>'motherId' is distinct from previous->'data'->>'motherId' or payload->>'birthId' is distinct from previous->'data'->>'birthId' or payload->>'scheduleId' is distinct from previous->'data'->>'scheduleId'
    ) and coalesce(length(trim(payload->>'correctionReason')),0)<3 then raise exception using errcode='22023',message='A correction reason is required.'; end if;
    if payload->>'motherId' is null and coalesce(length(trim(payload->'consent'->>'guardian')),0)=0 then raise exception using errcode='22023',message='Guardian information is required for an independent child.'; end if;
  end if;
  if payload ? 'subjectId' then
    subject_table := case payload->>'subjectType' when 'mother' then 'mothers' else 'children' end;
    perform public.require_record(subject_table,(payload->>'subjectId')::uuid,target_facility);
  end if;
  if entity_type='care_events' then
    source_kind := payload->>'kind';
    if payload->>'date'>(now() at time zone 'Asia/Kathmandu')::date::text then raise exception using errcode='22023',message='Recorded care cannot be in the future.'; end if;
    if (source_kind in ('vaccination','pnc_child') and payload->>'subjectType'<>'child') or (source_kind in ('anc','pnc_mother','td') and payload->>'subjectType'<>'mother') then raise exception using errcode='22023',message='Mother and newborn events must remain separate.'; end if;
    if actor_role='fchv' and (source_kind<>'vaccination' or (payload->>'verified')::boolean or payload->>'source'='provider_administered') then raise exception using errcode='42501',message='FCHV can record unverified vaccination history only.'; end if;
    if (payload->>'verified')::boolean and (actor_role not in ('health_worker','supervisor') or payload->>'source'<>'provider_administered') then raise exception using errcode='42501',message='Reported history requires a separate authorized verification.'; end if;
    if source_kind in ('anc','td') and payload->>'pregnancyId' is null then raise exception using errcode='22023',message='Pregnancy episode is required.'; end if;
    if source_kind='vaccination' then
      related := public.require_record('schedules',(payload->>'scheduleId')::uuid,target_facility); schedule_data := related->'data';
      if schedule_data->>'status'<>'active' or coalesce((schedule_data->>'testOnly')::boolean,true) or not exists(select 1 from jsonb_array_elements(schedule_data->'doses') d where d->>'code'=payload->>'doseCode') then raise exception using errcode='22023',message='Dose must belong to an approved schedule.'; end if;
    end if;
    if payload->>'supersedesId' is not null then
      if actor_role not in ('health_worker','supervisor') then raise exception using errcode='42501',message='Clinical correction requires a health worker.'; end if;
      related := public.require_record('care_events',(payload->>'supersedesId')::uuid,target_facility);
      if related->'data'->>'subjectId'<>payload->>'subjectId' or related->'data'->>'kind'<>source_kind or coalesce(length(trim(payload->>'note')),0)<3 then raise exception using errcode='22023',message='Correction needs the same subject, event kind and a reason.'; end if;
    end if;
  end if;
  if entity_type='event_reviews' then
    perform public.require_record('care_events',(payload->>'eventId')::uuid,target_facility);
    perform 1 from public.care_events where id=(payload->>'eventId')::uuid for update;
    select id into latest_review from public.event_reviews where event_id=(payload->>'eventId')::uuid order by created_at desc,id desc limit 1;
    if latest_review is distinct from (payload->>'expectedReviewId')::uuid then raise exception using errcode='40001',message='Another reviewer changed this event.'; end if;
  end if;
  if entity_type='follow_ups' then
    if not exists(select 1 from public.staff_profiles p join public.staff_scopes s on s.user_id=p.id where p.id=(payload->>'assigneeId')::uuid and p.active and s.facility_id=target_facility and s.ward_number=target_ward) then raise exception using errcode='42501',message='Task assignee must have the same catchment scope.'; end if;
    if actor_role='fchv' and payload->>'assigneeId'<>actor::text then raise exception using errcode='42501',message='FCHV may only assign their own tasks.'; end if;
    if actor_role='fchv' and previous is not null and previous->'data'->>'assigneeId'<>actor::text then raise exception using errcode='42501',message='Follow-up belongs to another worker.'; end if;
    if payload->>'status'='closed' then
      if actor_role not in ('health_worker','supervisor') then raise exception using errcode='42501',message='A health worker must confirm care completion.'; end if;
      related := public.require_record('care_events',(payload->>'completionEventId')::uuid,target_facility);
      select coalesce((select decision='verified' from (select data->>'decision' as decision from public.event_reviews where event_id=(payload->>'completionEventId')::uuid order by created_at desc,id desc limit 1) r),(related->'data'->>'verified')::boolean,false) into completion_verified;
      if not completion_verified or exists(select 1 from public.care_events where supersedes_id=(payload->>'completionEventId')::uuid)
        or related->'data'->>'subjectId' is distinct from payload->>'subjectId' or related->'data'->>'subjectType' is distinct from payload->>'subjectType'
        or (payload->>'category'<>'general' and related->'data'->>'kind' is distinct from case when payload->>'category'='pnc' then case when payload->>'subjectType'='mother' then 'pnc_mother' else 'pnc_child' end else payload->>'category' end)
        or (payload->>'doseCode' is not null and (related->'data'->>'doseCode' is distinct from payload->>'doseCode' or related->'data'->>'scheduleId' is distinct from payload->>'scheduleId'))
      then raise exception using errcode='22023',message='Completion requires a matching current verified care event.'; end if;
    elsif payload->>'completionEventId' is not null then raise exception using errcode='22023',message='An open follow-up cannot link a completion event.';
    end if;
  end if;
  if entity_type='attempts' then
    related := public.require_record('follow_ups',(payload->>'taskId')::uuid,target_facility);
    if actor_role='fchv' and related->'data'->>'assigneeId'<>actor::text then raise exception using errcode='42501',message='Follow-up belongs to another worker.'; end if;
    if payload->>'date'>(now() at time zone 'Asia/Kathmandu')::date::text then raise exception using errcode='22023',message='A contact attempt cannot be in the future.'; end if;
  end if;
  if entity_type='reviews' and payload->>'relatedId' is not null then perform public.require_record(subject_table,(payload->>'relatedId')::uuid,target_facility); end if;

  if action_name='create' then
    execute format('insert into public.%I(id,facility_id,ward_number,data,created_by) values($1,$2,$3,$4,$5) returning to_jsonb(%I.*)',entity_type,entity_type) into changed using entity_id,target_facility,target_ward,payload,actor;
  else
    execute format('update public.%I set data=$1,version=version+1,updated_at=clock_timestamp() where id=$2 returning to_jsonb(%I.*)',entity_type,entity_type) into changed using payload,entity_id;
  end if;
  insert into public.record_revisions(record_type,record_id,version,facility_id,ward_number,data,actor_id) values(entity_type,entity_id,(changed->>'version')::integer,target_facility,target_ward,payload,actor);
  insert into public.audit_events(actor_id,action,entity_type,entity_id,facility_id,ward_number,safe_summary) values(actor,action_name,entity_type,entity_id,target_facility,target_ward,jsonb_build_object('version',changed->'version','operationId',op_uuid));
  response := jsonb_build_object('record',public.entity_json(entity_type,changed),'duplicate',false);
  insert into public.sync_operations(user_id,operation_id,request,result) values(actor,op_uuid,operation_input,response);
  return response;
end;
$$;
revoke all on function public.apply_operation(jsonb) from public,anon;
grant execute on function public.apply_operation(jsonb) to authenticated;

-- A linked registration is all-or-nothing, including revisions, audits and receipts.
create function public.apply_operations(operation_inputs jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare item jsonb; results jsonb := '[]';
begin
  if jsonb_typeof(operation_inputs)<>'array' or jsonb_array_length(operation_inputs) not between 1 and 30 then raise exception using errcode='22023',message='Expected between 1 and 30 operations.'; end if;
  for item in select value from jsonb_array_elements(operation_inputs) loop
    results := results || jsonb_build_array(public.apply_operation(item));
  end loop;
  return jsonb_build_object('results',results);
end;
$$;
revoke all on function public.apply_operations(jsonb) from public,anon;
grant execute on function public.apply_operations(jsonb) to authenticated;

create function public.load_workspace() returns jsonb language plpgsql security definer set search_path = '' as $$
declare profile public.staff_profiles%rowtype; entity_name text; items jsonb := '[]'; group_items jsonb; history jsonb; wards jsonb; facility_name text;
begin
  select * into profile from public.staff_profiles where id=auth.uid() and active;
  if not found then raise exception using errcode='42501',message='An active staff account is required.'; end if;
  select jsonb_agg(ward_number order by ward_number) into wards from public.staff_scopes where user_id=profile.id and facility_id=profile.facility_id;
  if wards is null then raise exception using errcode='42501',message='A catchment assignment is required.'; end if;
  select name into facility_name from public.health_facilities where id=profile.facility_id;
  foreach entity_name in array array['mothers','pregnancies','births','children','care_events','event_reviews','appointments','follow_ups','attempts','sessions','consents','schedules','reviews'] loop
    if entity_name<>'schedules' and profile.role not in ('fchv','health_worker','supervisor') then continue; end if;
    execute format('select coalesce(jsonb_agg(public.entity_json(%L,to_jsonb(r)) order by created_at,id),''[]''::jsonb) from public.%I r
      where public.can_access_record(facility_id,ward_number,%L) and (%L<>''schedules'' or (data->>''status''=''active'' and coalesce((data->>''testOnly'')::boolean,false)=false) or public.staff_role() in (''clinical_approver'',''municipality_admin'',''system_admin''))',entity_name,entity_name,entity_name,entity_name) into group_items;
    items := items || group_items;
  end loop;
  insert into public.audit_events(actor_id,action,entity_type,entity_id,facility_id,safe_summary) values(profile.id,'workspace_read','workspace',profile.facility_id,profile.facility_id,jsonb_build_object('recordCount',jsonb_array_length(items)));
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'actor',p.full_name,'action',a.action,'entityId',a.entity_id,'entityType',a.entity_type,'at',a.occurred_at) order by a.occurred_at desc),'[]') into history
    from (select * from public.audit_events where actor_id=profile.id or (profile.role='supervisor' and ward_number is not null and public.can_access_record(facility_id,ward_number,entity_type)) order by occurred_at desc limit 200) a join public.staff_profiles p on p.id=a.actor_id;
  return jsonb_build_object('profile',jsonb_build_object('id',profile.id,'name',profile.full_name,'role',profile.role,'facilityId',profile.facility_id,'facilityName',facility_name,'wardIds',wards,'active',profile.active),'records',items,'audit',history,'serverTime',clock_timestamp());
end;
$$;
revoke all on function public.load_workspace() from public,anon;
grant execute on function public.load_workspace() to authenticated;

create function public.record_access(action_name text, record_type text, record_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare profile public.staff_profiles%rowtype; item jsonb; target_ward integer;
begin
  select * into profile from public.staff_profiles where id=auth.uid() and active;
  if not found or action_name not in ('read','print','export') then raise exception using errcode='42501',message='Access denied.'; end if;
  if action_name in ('print','export') and profile.role not in ('health_worker','supervisor') then raise exception using errcode='42501',message='Export requires health-post authorization.'; end if;
  if record_type='workspace' and action_name='export' then
    if record_id<>profile.facility_id then raise exception using errcode='42501',message='Access denied.'; end if;
  else
    if record_type not in ('mothers','children') then raise exception using errcode='22023',message='Invalid access event.'; end if;
    item := public.require_record(record_type,record_id,profile.facility_id); target_ward := (item->>'ward_number')::integer;
  end if;
  insert into public.audit_events(actor_id,action,entity_type,entity_id,facility_id,ward_number) values(profile.id,action_name,record_type,record_id,profile.facility_id,target_ward);
end;
$$;
revoke all on function public.record_access(text,text,uuid) from public,anon;
grant execute on function public.record_access(text,text,uuid) to authenticated;

-- Offline access metadata retains both the device observation time and server receipt time.
create function public.record_access_event(access_input jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare profile public.staff_profiles%rowtype; item jsonb; access_id uuid; record_id uuid; record_type text; action_name text; observed timestamptz; receipt public.sync_operations%rowtype;
begin
  select * into profile from public.staff_profiles where id=auth.uid() and active;
  if not found then raise exception using errcode='42501',message='An active staff account is required.'; end if;
  access_id := (access_input->>'id')::uuid; record_id := (access_input->>'entityId')::uuid;
  record_type := access_input->>'entityType'; action_name := access_input->>'action'; observed := (access_input->>'occurredAt')::timestamptz;
  if access_id is null or record_id is null or observed is null or coalesce(record_type,'') not in ('mothers','children') or coalesce(action_name,'') not in ('read','print') or pg_column_size(access_input)>2048 then raise exception using errcode='22023',message='Invalid access metadata.'; end if;
  if action_name='print' and profile.role not in ('health_worker','supervisor') then raise exception using errcode='42501',message='Print requires health-post authorization.'; end if;
  item := public.require_record(record_type,record_id,profile.facility_id);
  perform pg_advisory_xact_lock(hashtextextended(profile.id::text||':'||access_id::text,0));
  select * into receipt from public.sync_operations where user_id=profile.id and operation_id=access_id;
  if found then
    if receipt.request<>access_input then raise exception using errcode='40001',message='Access identifier reused with another payload.'; end if;
    return jsonb_build_object('ok',true,'duplicate',true);
  end if;
  insert into public.audit_events(actor_id,action,entity_type,entity_id,facility_id,ward_number,safe_summary)
    values(profile.id,action_name,record_type,record_id,profile.facility_id,(item->>'ward_number')::integer,jsonb_build_object('deviceObservedAt',observed,'accessId',access_id));
  insert into public.sync_operations(user_id,operation_id,request,result) values(profile.id,access_id,access_input,jsonb_build_object('ok',true));
  return jsonb_build_object('ok',true,'duplicate',false);
end;
$$;
revoke all on function public.record_access_event(jsonb) from public,anon;
grant execute on function public.record_access_event(jsonb) to authenticated;

commit;
