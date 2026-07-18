-- Fase 5: zachte verwijdering van facturen (prullenbak).
alter table facturen add column if not exists verwijderd boolean not null default false;
