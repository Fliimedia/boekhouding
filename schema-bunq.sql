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
