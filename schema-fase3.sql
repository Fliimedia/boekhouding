-- Fase 3: parse-herkomst en vertrouwen. Draai na schema-fase2.sql.
alter table facturen add column if not exists parse_bron text;
alter table facturen add column if not exists parse_confidence numeric(4,3);
