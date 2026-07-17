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
