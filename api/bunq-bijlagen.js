// Bijlagen-endpoint. Haalt de bonnen en facturen op die in de bunq-app aan
// betalingen zijn gehangen (note attachments), bewaart ze in storage en
// koppelt ze direct en bevestigd aan de transactie.
//
// Werkt in blokken (bunq staat ongeveer 1 GET per seconde toe) met een cursor
// per entiteit, zodat elke aanroep verder gaat waar de vorige stopte.
//
// Aanroep: GET /api/bunq-bijlagen?run=1&type=werkmaatschappij&van=2025-01-01
//          &reset=1          begin opnieuw
//          &debug=<tx id>    toon de ruwe bunq-respons voor één transactie

import { createClient } from '@supabase/supabase-js';
import { ensureContext, getUserId, listMonetaryAccounts, bunqGet, bunqRaw } from '../lib/bunq.js';
import { magErin } from '../lib/auth.js';

export const maxDuration = 300;

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const normIban = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();

// Zoek alle bijlage-id's in een note-attachment respons, ongeacht de exacte vorm.
function bijlageIds(resp) {
  const uit = [];
  for (const item of resp || []) {
    const note = item && item[Object.keys(item)[0]];
    if (!note) continue;
    let att = note.attachment;
    if (!att) continue;
    if (!Array.isArray(att)) att = [att];
    for (const a of att) {
      const id = a?.id ?? a?.attachment_id ?? a?.attachment?.id;
      if (id) uit.push({ noteId: note.id, attId: id, omschrijving: note.description || a?.description || null });
    }
  }
  return uit;
}

function extensie(ct) {
  if (/pdf/i.test(ct)) return 'pdf';
  if (/png/i.test(ct)) return 'png';
  if (/jpe?g/i.test(ct)) return 'jpg';
  if (/heic/i.test(ct)) return 'heic';
  return 'bin';
}

export default async function handler(req, res) {
  if (!magErin(req, res)) return;
  if (!(req.method === 'GET' && req.query?.run === '1') && req.method !== 'POST') {
    return res.status(405).json({ ok: false, reden: 'Gebruik POST of GET met run=1' });
  }
  const start = Date.now();
  const url = process.env.SUPABASE_URL;
  const serviceKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_API_KEY || process.env.SUPABASE_KEY);
  if (!url || !serviceKey) return res.status(200).json({ ok: false, reden: 'Supabase env vars ontbreken' });
  const supabase = createClient(url, serviceKey);

  try {
    const type = req.query?.type === 'holding' ? 'holding' : 'werkmaatschappij';
    const van = /^\d{4}-\d{2}-\d{2}$/.test(req.query?.van || '') ? req.query.van : '2025-01-01';
    const n = Math.min(Math.max(parseInt(req.query?.n, 10) || 35, 1), 45);

    const { data: ents } = await supabase.from('entiteiten').select('id, type').order('id');
    const ent = (ents || []).find((e) => e.type === type);
    if (!ent) return res.status(200).json({ ok: false, reden: `Geen entiteit ${type}` });

    // Zelfde sleutelkeuze als bunq-sync: per entiteit, anders gedeeld.
    const perKey = type === 'holding' ? process.env.BUNQ_API_KEY_HOLDING : process.env.BUNQ_API_KEY_WERKMAATSCHAPPIJ;
    const heeftPer = process.env.BUNQ_API_KEY_HOLDING || process.env.BUNQ_API_KEY_WERKMAATSCHAPPIJ;
    let apiKey, ctxEntity;
    if (heeftPer) { apiKey = perKey; ctxEntity = ent.id; }
    else {
      // Gedeelde sleutel: hergebruik de bestaande, geregistreerde context van bunq-sync.
      apiKey = process.env.BUNQ_API_KEY;
      const { data: ctxs } = await supabase.from('bunq_context').select('entity_id, device_registered, updated_at')
        .eq('device_registered', true).order('updated_at', { ascending: false }).limit(1);
      ctxEntity = ctxs?.[0]?.entity_id ?? ents[0].id;
    }
    if (!apiKey) return res.status(200).json({ ok: false, reden: 'Geen bunq-sleutel voor deze entiteit' });

    const { data: ctxRow } = await supabase.from('bunq_context').select('*').eq('entity_id', ctxEntity).maybeSingle();
    const save = async (c) => {
      await supabase.from('bunq_context').upsert({
        entity_id: ctxEntity, private_key_pem: c.private_key_pem, public_key_pem: c.public_key_pem,
        installation_token: c.installation_token, server_public_key: c.server_public_key,
        device_registered: c.device_registered, session_token: c.session_token,
        session_user_id: c.session_user_id, session_expires_at: c.session_expires_at,
        updated_at: new Date().toISOString(),
      });
    };
    const context = await ensureContext({ apiKey, ctx: ctxRow || {}, save });
    const uid = await getUserId(context);
    const accounts = await listMonetaryAccounts(context, uid);
    const accByIban = {};
    for (const a of accounts) if (a.iban) accByIban[normIban(a.iban)] = a.id;

    // Debug: ruwe respons voor één transactie.
    if (req.query?.debug) {
      const { data: tx } = await supabase.from('transacties').select('*').eq('id', req.query.debug).maybeSingle();
      if (!tx) return res.status(200).json({ ok: false, reden: 'transactie niet gevonden' });
      const pid = String(tx.extern_id || '').split(':')[1];
      const maid = accByIban[normIban(tx.rekening_iban)];
      const uit = { ok: true, tx, maid, pid };
      try { uit.payment = await bunqGet(context, `/v1/user/${uid}/monetary-account/${maid}/payment/${pid}`); } catch (e) { uit.paymentFout = e.message; }
      try { uit.notes = await bunqGet(context, `/v1/user/${uid}/monetary-account/${maid}/payment/${pid}/note-attachment`); } catch (e) { uit.notesFout = e.message; }
      try { uit.events = await bunqGet(context, `/v1/user/${uid}/event?monetary_account_id=${maid}&count=5`); } catch (e) { uit.eventsFout = e.message; }
      return res.status(200).json(uit);
    }

    // Werkwijze: loop door de bunq-events van de rekening (nieuw naar oud). Overboekingen
    // hebben notities op de Payment, kaartbetalingen op de MasterCardAction.
    const iban = type === 'holding' ? 'NL95BUNQ2060792940' : 'NL23BUNQ2060789095';
    const maid = accByIban[iban];
    if (!maid) return res.status(200).json({ ok: false, reden: `Rekening ${iban} niet gevonden` });

    const cursorSleutel = `bunq_bijlagen_ev:${ent.id}:${van}`;
    if (req.query?.reset === '1') await supabase.from('app_state').delete().eq('sleutel', cursorSleutel);
    const { data: st } = await supabase.from('app_state').select('waarde').eq('sleutel', cursorSleutel).maybeSingle();
    if (st?.waarde === 'KLAAR') return res.status(200).json({ ok: true, klaar: true, reden: 'Alle events zijn al bekeken. reset=1 om opnieuw te beginnen.' });
    let olderId = st?.waarde ? Number(st.waarde) : null;

    const budget = Math.min(Math.max(parseInt(req.query?.sec, 10) || 270, 20), 280) * 1000;
    let bekeken = 0, gevonden = 0, opgeslagen = 0, nietGekoppeld = 0, klaar = false, laatste = olderId, laatsteDatum = null;
    const fouten = [];

    async function zoekTransactie(obj, soort) {
      if (soort === 'Payment') {
        const { data } = await supabase.from('transacties').select('id, datum, bedrag, tegenpartij').eq('extern_id', `bunq:${obj.id}`).limit(1);
        return data?.[0] || null;
      }
      const bedrag = Number(obj.amount_billing?.value ?? obj.amount_local?.value ?? 0);
      const d = new Date((obj.created || '').slice(0, 10));
      const van2 = new Date(d.getTime() - 2 * 86400000).toISOString().slice(0, 10);
      const tot2 = new Date(d.getTime() + 7 * 86400000).toISOString().slice(0, 10);
      const { data } = await supabase.from('transacties').select('id, datum, bedrag, tegenpartij, omschrijving')
        .eq('entity_id', ent.id).eq('rekening_iban', iban).gte('datum', van2).lte('datum', tot2)
        .in('bedrag', [-bedrag, bedrag]).limit(10);
      const desc = String(obj.description || '').trim().toLowerCase();
      return (data || []).find((t) => String(t.omschrijving || '').trim().toLowerCase() === desc) || (data || [])[0] || null;
    }

    buiten: while (Date.now() - start < budget) {
      const resp = await bunqGet(context, `/v1/user/${uid}/event?monetary_account_id=${maid}&count=200${olderId ? `&older_id=${olderId}` : ''}`);
      await wacht(1050);
      const events = (resp || []).map((x) => x.Event).filter(Boolean);
      if (!events.length) { klaar = true; break; }
      for (const ev of events) {
        if (Date.now() - start > budget) break buiten;
        if ((ev.created || '').slice(0, 10) < van) { klaar = true; break buiten; }
        laatste = ev.id; laatsteDatum = (ev.created || '').slice(0, 10);
        const soort = Object.keys(ev.object || {})[0];
        const obj = ev.object?.[soort];
        const relevant = obj && ev.is_event_latest_for_object !== false &&
          ((soort === 'Payment' && obj.type !== 'MASTERCARD') || soort === 'MasterCardAction');
        if (!relevant) continue;
        bekeken += 1;
        const pad = soort === 'Payment' ? 'payment' : 'mastercard-action';
        let ids = [];
        try {
          ids = bijlageIds(await bunqGet(context, `/v1/user/${uid}/monetary-account/${maid}/${pad}/${obj.id}/note-attachment`));
        } catch (e) { if (!/support notes/i.test(e.message)) fouten.push(`${soort} ${obj.id}: ${e.message}`); }
        await wacht(1050);
        if (!ids.length) continue;

        const tx = await zoekTransactie(obj, soort);
        for (const b of ids) {
          gevonden += 1;
          const bronId = `bunq:${b.noteId}:${b.attId}`;
          const { data: bestaat } = await supabase.from('facturen').select('id').eq('bron', 'bunq').eq('bron_id', bronId).limit(1);
          if (bestaat && bestaat.length) continue;
          let inhoud = null;
          for (const p of [`/v1/user/${uid}/attachment/${b.attId}/content`, `/v1/user/${uid}/monetary-account/${maid}/attachment/${b.attId}/content`]) {
            try { inhoud = await bunqRaw(context, p); break; } catch (e) { if (p.includes('monetary')) fouten.push(`bijlage ${b.attId}: ${e.message}`); }
            await wacht(1050);
          }
          await wacht(1050);
          if (!inhoud) continue;
          const ext = extensie(inhoud.contentType);
          const opslagPad = `${ent.id}/bunq_${b.attId}.${ext}`;
          const { error: upErr } = await supabase.storage.from('facturen')
            .upload(opslagPad, inhoud.bytes, { contentType: inhoud.contentType, upsert: true });
          if (upErr) { fouten.push(`opslag ${b.attId}: ${upErr.message}`); continue; }
          const isPdf = ext === 'pdf';
          const bedrag = tx ? Number(tx.bedrag) : -Number(obj.amount_billing?.value ?? obj.amount?.value ?? 0);
          const { data: fac, error: insErr } = await supabase.from('facturen').insert({
            entity_id: ent.id,
            richting: bedrag < 0 ? 'inkoop' : 'verkoop',
            tegenpartij: tx?.tegenpartij || obj.counterparty_alias?.display_name || null,
            status: tx ? 'betaald' : 'open',
            totaal: isPdf ? null : Math.abs(bedrag),
            parse_bron: isPdf ? null : 'bunq-afbeelding',
            bron: 'bunq', bron_id: bronId, bron_datum: tx?.datum || (ev.created || '').slice(0, 10),
            bestandsnaam: b.omschrijving || `bunq-bijlage-${b.attId}.${ext}`,
            bronbestand_url: opslagPad,
          }).select('id').maybeSingle();
          if (insErr) { fouten.push(`factuur ${b.attId}: ${insErr.message}`); continue; }
          if (tx) {
            // Bijlage in bunq is een zekere koppeling: voorstel vervangen en bevestigen.
            await supabase.from('koppelingen').delete().eq('transactie_id', tx.id).eq('bevestigd', false);
            await supabase.from('koppelingen').insert({ transactie_id: tx.id, factuur_id: fac.id, confidence: 1, bevestigd: true });
          } else nietGekoppeld += 1;
          opgeslagen += 1;
        }
      }
      if (events.length < 200) { klaar = true; break; }
      olderId = events[events.length - 1].id;
    }

    await supabase.from('app_state').upsert({ sleutel: cursorSleutel, waarde: klaar ? 'KLAAR' : String(laatste), updated_at: new Date().toISOString() });
    return res.status(200).json({ ok: fouten.length === 0, type, bekeken, gevonden, opgeslagen, nietGekoppeld, klaar, gestart_bij: olderId, tot_en_met: laatsteDatum, duur_ms: Date.now() - start, fouten: fouten.slice(0, 10) });
  } catch (e) {
    return res.status(200).json({ ok: false, reden: String(e.message || e).slice(0, 300) });
  }
}
