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

const KEY_PER_TYPE = {
  holding: 'BUNQ_API_KEY_HOLDING',
  werkmaatschappij: 'BUNQ_API_KEY_WERKMAATSCHAPPIJ',
};

function netteFout(msg) {
  const s = String(msg || '');
  if (s.includes('<!DOCTYPE') || s.includes('<html')) {
    return 'Supabase antwoordt met een dashboard-pagina. SUPABASE_URL wijst naar het dashboard in plaats van de project-API. Gebruik de Project URL (https://<ref>.supabase.co) uit Project Settings, API.';
  }
  return s.slice(0, 300);
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
      return res.status(200).json({ ok: false, reden: 'Geen entiteiten gevonden. Draai schema-all.sql in Supabase.' });
    }

    // Reset: wis de opgeslagen handshake zodat een wildcard-key opnieuw registreert.
    if (req.query?.reset === '1') {
      for (const ent of entiteiten) {
        await supabase.from('bunq_context').delete().eq('entity_id', ent.id);
      }
    }

    const resultaten = [];

    for (const ent of entiteiten) {
      const envNaam = KEY_PER_TYPE[ent.type];
      const apiKey = process.env[envNaam];
      if (!apiKey) {
        resultaten.push({ entiteit: ent.naam, ok: false, reden: `${envNaam} ontbreekt` });
        continue;
      }

      try {
        // Context laden uit db (of leeg).
        const { data: ctxRow } = await supabase
          .from('bunq_context')
          .select('*')
          .eq('entity_id', ent.id)
          .maybeSingle();

        const save = async (context) => {
          await supabase.from('bunq_context').upsert({
            entity_id: ent.id,
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

        const context = await ensureContext({ apiKey, ctx: ctxRow || {}, save });

        // Rekeningen en betalingen ophalen.
        const accounts = await listMonetaryAccounts(context);
        let nieuw = 0;
        for (const acc of accounts) {
          const betalingen = await listPayments(context, acc.id);
          if (betalingen.length === 0) continue;
          const rijen = betalingen.map((b) => ({ ...b, entity_id: ent.id, bron: 'bunq' }));
          // Upsert op (bron, extern_id) voorkomt dubbele transacties.
          const { error: upErr, count } = await supabase
            .from('transacties')
            .upsert(rijen, { onConflict: 'bron,extern_id', ignoreDuplicates: true, count: 'exact' });
          if (upErr) throw new Error(upErr.message);
          nieuw += count ?? rijen.length;
        }

        resultaten.push({ entiteit: ent.naam, ok: true, rekeningen: accounts.length, verwerkt: nieuw });
      } catch (err) {
        resultaten.push({ entiteit: ent.naam, ok: false, reden: String(err.message || err) });
      }
    }

    const allesOk = resultaten.every((r) => r.ok);
    return res.status(200).json({ ok: allesOk, resultaten });
  } catch (err) {
    return res.status(200).json({ ok: false, reden: `onverwacht: ${netteFout(err.message || err)}` });
  }
}
