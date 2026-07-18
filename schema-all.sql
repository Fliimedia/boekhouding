-- Boekhouding: volledig schema. Veilig om opnieuw te draaien.

-- === Basis ===
-- Boekhouding overzicht: databaseschema
-- Aparte BTW-administraties per entiteit. Elk record heeft een entity_id.
-- Draai dit eenmalig in de Supabase SQL editor.

create table if not exists entiteiten (
  id           bigserial primary key,
  naam         text not null,
  type         text not null check (type in ('holding', 'werkmaatschappij')),
  btw_nummer   text,
  kvk          text,
  created_at   timestamptz not null default now()
);

create table if not exists facturen (
  id             bigserial primary key,
  entity_id      bigint not null references entiteiten(id),
  richting       text not null check (richting in ('verkoop', 'inkoop')),
  tegenpartij    text,
  factuurnummer  text,
  factuurdatum   date,
  vervaldatum    date,
  bedrag_excl    numeric(12,2),
  btw_bedrag     numeric(12,2),
  btw_tarief     text check (btw_tarief in ('21', '9', '0', 'verlegd')),
  totaal         numeric(12,2),
  status         text not null default 'open' check (status in ('open', 'betaald')),
  is_onderlings  boolean not null default false,
  bronbestand_url text,
  bron           text,
  created_at     timestamptz not null default now()
);

create table if not exists transacties (
  id             bigserial primary key,
  entity_id      bigint not null references entiteiten(id),
  datum          date not null,
  bedrag         numeric(12,2) not null,
  tegenpartij    text,
  omschrijving   text,
  iban_tegenpartij text,
  bron           text not null default 'bunq',
  extern_id      text,
  created_at     timestamptz not null default now(),
  unique (bron, extern_id)
);

create table if not exists koppelingen (
  id            bigserial primary key,
  transactie_id bigint not null references transacties(id),
  factuur_id    bigint not null references facturen(id),
  confidence    numeric(4,3) not null default 0,
  bevestigd     boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (transactie_id, factuur_id)
);

create index if not exists idx_facturen_entity on facturen(entity_id);
create index if not exists idx_facturen_datum on facturen(factuurdatum);
create index if not exists idx_transacties_entity on transacties(entity_id);
create index if not exists idx_transacties_datum on transacties(datum);

-- === Bunq context ===
-- Bunq context: bewaart de handshake-state per entiteit zodat de serverless
-- functie sessies kan hergebruiken en vernieuwen. Draai na schema.sql.

create table if not exists bunq_context (
  entity_id          bigint primary key references entiteiten(id),
  private_key_pem    text not null,
  public_key_pem     text not null,
  installation_token text,
  server_public_key  text,
  device_registered  boolean not null default false,
  session_token      text,
  session_user_id    bigint,
  session_expires_at timestamptz,
  updated_at         timestamptz not null default now()
);

-- Seed van de twee entiteiten (namen en fiscale gegevens kun je later aanvullen).
insert into entiteiten (naam, type)
select 'Holding', 'holding'
where not exists (select 1 from entiteiten where type = 'holding');

insert into entiteiten (naam, type)
select 'Werkmaatschappij', 'werkmaatschappij'
where not exists (select 1 from entiteiten where type = 'werkmaatschappij');

-- === Fase 2: ingest ===
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

-- === Fase 3: parse ===
-- Fase 3: parse-herkomst en vertrouwen. Draai na schema-fase2.sql.
alter table facturen add column if not exists parse_bron text;
alter table facturen add column if not exists parse_confidence numeric(4,3);

-- === Sweep cursor ===
-- Sleutel-waarde tabel voor app-status, onder andere de Gmail sweep-cursor.
create table if not exists app_state (
  sleutel    text primary key,
  waarde     text,
  updated_at timestamptz not null default now()
);

-- === Fase 4: IBAN-koppeling ===
-- Fase 4: rekening-naar-entiteit koppeling op IBAN. Draai na de vorige schema's.
alter table entiteiten add column if not exists iban text;
alter table transacties add column if not exists rekening_iban text;

-- === Fase 5: prullenbak ===
-- Fase 5: zachte verwijdering van facturen (prullenbak).
alter table facturen add column if not exists verwijderd boolean not null default false;
