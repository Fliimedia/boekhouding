-- Sleutel-waarde tabel voor app-status, onder andere de Gmail sweep-cursor.
create table if not exists app_state (
  sleutel    text primary key,
  waarde     text,
  updated_at timestamptz not null default now()
);
