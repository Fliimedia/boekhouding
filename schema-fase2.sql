-- Fase 2: automatische ingest. Draai na schema.sql en schema-bunq.sql.

-- Bronherkomst voor dedupe en weergave voor de PDF geparseerd is.
alter table facturen add column if not exists bron_id text;
alter table facturen add column if not exists bron_datum date;
alter table facturen add column if not exists bestandsnaam text;

create unique index if not exists uniq_facturen_bron
  on facturen (bron, bron_id) where bron_id is not null;

-- Private bucket voor bronbestanden (7 jaar bewaarplicht).
insert into storage.buckets (id, name, public)
values ('facturen', 'facturen', false)
on conflict (id) do nothing;
