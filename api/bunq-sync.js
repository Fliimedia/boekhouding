// Sync-endpoint. Haalt banktransacties op via Bunq en schrijft ze in de transacties-tabel.
// Server-side: API-keys en Supabase-keys blijven hier, nooit in de client.
//
// Env vars op Vercel:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
//   BUNQ_API_KEY_HOLDING, BUNQ_API_KEY_WERKMAATSCHAPPIJ
//
// Aanroep: POST /api/bunq-sync            (beide entiteiten)
//          POST /api/bunq-sync?type=holding

import { createClient } from '@supabase/supabase-js';
import { ensureContext, listMonetaryAccounts, listPayments } from '../lib/bunq.js';

export const maxDuration = 60;

function netteFout(msg) {
  const s = String(msg || '');
  if (s.includes('<!DOCTYPE') || s.includes('<html')) {
    return 'Supabase antwoordt met een dashboard-pagina. SUPABASE_URL wijst naar het dashboard in plaats van de project-API. Gebruik de Project URL (https://<ref>.supabase.co) uit Project Settings, API.';
  }
  return s.slice(0, 300);
}

function sleutelRol(key) {
  try {
    if (!key) return 'geen';
    if (key.startsWith('sb_secret_')) return 'service';
    if (key.startsWith('sb_publishable_')) return 'anon';
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    return payload.role || 'onbekend';
  } catch { return 'onbekend'; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reden: 'Gebruik POST' });
  }
  try {
    const url = process.env.SUPABASE_URL;
    const serviceKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_API_KEY || process.env.SUPABASE_KEY);
    if (!url || !serviceKey) {
      return res.status(200).json({ ok: false, reden: 'Supabase env vars ontbreken' });
    }
    const supabase = createClient(url, serviceKey);

    const filterType = req.query?.type;
    const { data: entiteiten, error: entError } = await supabase
      .from('entiteiten')
      .select('id, naam, type')
      .in('type', filterType ? [filterType] : ['holding', 'werkmaatschappij']);
    if (entError) return res.status(200).json({ ok: false, reden: `entiteiten: ${netteFout(entError.message)}` });
    if (!entiteiten || entiteiten.length === 0) {
      const { count: totaal } = await supabase.from('entiteiten').select('*', { count: 'exact', head: true });
      const rol = sleutelRol(serviceKey);
      let hint;
      if ((totaal || 0) > 0) hint = `Er zijn ${totaal} entiteiten, maar geen met type holding of werkmaatschappij.`;
      else if (rol === 'anon') hint = 'Je gebruikt de anon/publishable sleutel. Gebruik de service_role (secret) sleutel, anders verbergt de rij-beveiliging de data.';
      else hint = 'Deze database is leeg. Draai schema-all.sql in DIT project (de Project URL die je nu gebruikt).';
      return res.status(200).json({ ok: false, reden: `Geen entiteiten. ${hint} (rijen: ${totaal || 0}, sleutel: ${rol})` });
    }

    // Reset: wis de opgeslagen handshake zodat een wildcard-key opnieuw registreert.
    if (req.query?.reset === '1') {
      for (const ent of entiteiten) {
        await supabase.from('bunq_context').delete().eq('entity_id', ent.id);
      }
    }

    const holdingId = (entiteiten.find((e) => e.type === 'holding') || {}).id || null;
    const werkId = (entiteiten.find((e) => e.type === 'werkmaatschappij') || {}).id || null;
    const defaultEntity = werkId || entiteiten[0].id;

    const normIban = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
    const { data: ibanRows } = await supabase.from('entiteiten').select('id, iban');
    const ibanMap = {};
    for (const e of ibanRows || []) { if (e && e.iban) ibanMap[normIban(e.iban)] = e.id; }
    if (process.env.BUNQ_IBAN_HOLDING && holdingId) ibanMap[normIban(process.env.BUNQ_IBAN_HOLDING)] = holdingId;
    if (process.env.BUNQ_IBAN_WERKMAATSCHAPPIJ && werkId) ibanMap[normIban(process.env.BUNQ_IBAN_WERKMAATSCHAPPIJ)] = werkId;
    // Ingebouwde standaard voor de twee bekende rekeningen, als terugval.
    const STANDAARD = { werkmaatschappij: 'NL23BUNQ2060789095', holding: 'NL95BUNQ2060792940' };
    if (werkId && !Object.values(ibanMap).includes(werkId)) ibanMap[normIban(STANDAARD.werkmaatschappij)] = werkId;
    if (holdingId && !Object.values(ibanMap).includes(holdingId)) ibanMap[normIban(STANDAARD.holding)] = holdingId;

    // Logins bepalen: per entiteit een eigen sleutel, of een gedeelde sleutel.
    const logins = [];
    const perH = process.env.BUNQ_API_KEY_HOLDING;
    const perW = process.env.BUNQ_API_KEY_WERKMAATSCHAPPIJ;
    if (perH || perW) {
      if (perH && holdingId) logins.push({ naam: 'Holding', key: perH, ctxEntity: holdingId, vast: holdingId });
      if (perW && werkId) logins.push({ naam: 'Werkmaatschappij', key: perW, ctxEntity: werkId, vast: werkId });
    } else if (process.env.BUNQ_API_KEY) {
      logins.push({ naam: 'Bunq', key: process.env.BUNQ_API_KEY, ctxEntity: entiteiten[0].id, vast: null });
    }
    if (logins.length === 0) {
      return res.status(200).json({ ok: false, reden: 'Geen Bunq sleutel. Zet BUNQ_API_KEY in Vercel (of per entiteit BUNQ_API_KEY_HOLDING en BUNQ_API_KEY_WERKMAATSCHAPPIJ).' });
    }

    const resultaten = [];
    for (const login of logins) {
      try {
        const { data: ctxRow } = await supabase
          .from('bunq_context').select('*').eq('entity_id', login.ctxEntity).maybeSingle();

        const save = async (context) => {
          await supabase.from('bunq_context').upsert({
            entity_id: login.ctxEntity,
            private_key_pem: context.private_key_pem,
            public_key_pem: context.public_key_pem,
            installation_token: context.installation_token,
            server_public_key: context.server_public_key,
            device_registered: context.device_registered,
            session_token: context.session_token,
            session_user_id: context.session_user_id,
            session_expires_at: context.session_expires_at,
            updated_at: new Date().toISOString(),
          });
        };

        const context = await ensureContext({ apiKey: login.key, ctx: ctxRow || {}, save });
        const accounts = await listMonetaryAccounts(context);
        const maand = req.query?.maand === '1';
        const d30 = new Date(Date.now() - 32 * 86400000).toISOString().slice(0, 10);
        const sinds = maand ? d30 : `${new Date().getFullYear()}-01-01`;
        let nieuw = 0, gebruikt = 0;
        for (const acc of accounts) {
          if (acc.status !== 'ACTIVE') continue;
          // Harde afscherming: alleen rekeningen die expliciet aan een entiteit
          // gekoppeld zijn worden gebruikt. Andere rekeningen nooit.
          const entityId = login.vast && ibanMap[normIban(acc.iban)] === login.vast
            ? login.vast
            : ibanMap[normIban(acc.iban)];
          if (!entityId) continue;
          gebruikt += 1;
          const betalingen = await listPayments(context, acc.id, { sinds });
          if (betalingen.length === 0) continue;
          const rijen = betalingen.map((b) => ({ ...b, entity_id: entityId, rekening_iban: acc.iban, bron: 'bunq' }));
          const { error: upErr, count } = await supabase
            .from('transacties')
            .upsert(rijen, { onConflict: 'bron,extern_id', count: 'exact' });
          if (upErr) throw new Error(upErr.message);
          nieuw += count ?? rijen.length;
        }
        resultaten.push({
          entiteit: login.naam, ok: true, rekeningen: gebruikt, verwerkt: nieuw,
          gevonden: accounts.map((a) => ({ iban: a.iban, status: a.status })),
          ingesteld: Object.keys(ibanMap),
        });
      } catch (err) {
        resultaten.push({ entiteit: login.naam, ok: false, reden: netteFout(err.message || err) });
      }
    }

    const allesOk = resultaten.every((r) => r.ok);
    return res.status(200).json({ ok: allesOk, resultaten });
  } catch (err) {
    return res.status(200).json({ ok: false, reden: `onverwacht: ${netteFout(err.message || err)}` });
  }
}
