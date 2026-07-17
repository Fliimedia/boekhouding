# Boekhouding overzicht

Zelfgebouwd administratie-overzicht voor Holding en werkmaatschappij.
Aparte BTW-administraties per entiteit. Vervangt Moneybird qua overzicht.

## Structuur
- App.jsx           single-file React shell (i18n NL/EN, entiteit-schakelaar, 5 views)
- api/health.js     server-side databasecheck (Supabase keys blijven hier)
- schema.sql        databaseschema, eenmalig in Supabase SQL editor draaien
- build.mjs         esbuild compile naar public/bundle.js
- vercel.json       Vercel config (build plus serverless functie)

## Env vars op Vercel (nooit in de client)
- SUPABASE_URL
- SUPABASE_SERVICE_KEY

## Bouwen
npm install
npm run check   (compile-check)
npm run build   (bundelt naar public/bundle.js)

## Status
Fase 0: skelet. Volgende stap is Fase 1, eerste Bunq-bankfeed live.
