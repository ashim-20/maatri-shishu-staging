-- Organization fixtures only. No staff passwords or patient data are inserted.
insert into public.municipalities(id,name) values('10000000-0000-4000-8000-000000000003','Parsa demonstration municipality') on conflict do nothing;
insert into public.health_facilities(id,municipality_id,name) values('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','Parsa Community Health Post (demo)') on conflict do nothing;
