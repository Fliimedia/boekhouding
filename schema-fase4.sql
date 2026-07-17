-- Fase 4: rekening-naar-entiteit koppeling op IBAN. Draai na de vorige schema's.
alter table entiteiten add column if not exists iban text;
alter table transacties add column if not exists rekening_iban text;
