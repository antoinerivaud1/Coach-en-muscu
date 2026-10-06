#!/usr/bin/env node
/**
 * Vérifie que les migrations Supabase rejouées sur une base NEUVE donnent le
 * schéma attendu, sans Docker (CM-85 PR 0).
 *
 * Ce que fait le script :
 *   1. démarre un Postgres en mémoire (PGlite, WASM) ;
 *   2. crée des stubs minimaux de ce que fournit la plateforme Supabase :
 *      rôles anon/authenticated/service_role, schéma `auth` (auth.users,
 *      auth.uid() qui renvoie null), schéma `extensions` ;
 *   3. applique supabase/migrations/*.sql dans l'ordre, puis supabase/seed.sql ;
 *   4. produit un instantané normalisé du schéma public (colonnes, contraintes,
 *      index, enums, fonctions + ACL, triggers, RLS, policies, grants).
 *
 * Usage (PGlite n'est PAS une dépendance du projet, l'installer hors du repo) :
 *   mkdir /tmp/pglite && (cd /tmp/pglite && npm init -y && npm i --no-save @electric-sql/pglite)
 *   PGLITE_DIR=/tmp/pglite node scripts/check-baseline.mjs          # applique + empreintes
 *   node scripts/check-baseline.mjs --print-hash-query              # même empreinte, SQL pour la prod
 *   PGLITE_DIR=/tmp/pglite node scripts/check-baseline.mjs --out local.json
 *   PGLITE_DIR=/tmp/pglite node scripts/check-baseline.mjs --compare prod.json
 *   node scripts/check-baseline.mjs --print-query                   # instantané détaillé, SQL
 *
 * Comparaison rapide : lancer --print-hash-query sur la prod (SELECT seul,
 * éditeur SQL ou MCP execute_sql) et comparer ligne à ligne avec les
 * empreintes (kind, n, hash) affichées en local. En cas d'écart, exporter
 * --print-query en JSON (tableau de {kind, name, def}) et utiliser --compare.
 * Code de sortie 1 si une migration échoue ou si --compare trouve un écart.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const SEED = join(ROOT, "supabase", "seed.sql");

export const SNAPSHOT_SQL = `
with acl as (
  select rel, string_agg(who || ':' || priv, ',' order by who, priv) as privs from (
    select c.relname::text as rel, a.privilege_type as priv,
           case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end as who
    from pg_class c join pg_namespace n on n.oid = c.relnamespace,
         aclexplode(c.relacl) a
    where n.nspname = 'public' and c.relkind = 'r'
  ) x group by rel
), facl as (
  select oid, string_agg(who, ',' order by who) as privs from (
    select p.oid,
           case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end as who
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where n.nspname = 'public'
  ) x group by oid
)
select * from (
  select 'column' as kind, c.relname || '.' || a.attname as name,
         format_type(a.atttypid, a.atttypmod) || ' notnull=' || a.attnotnull
           || ' default=' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-') as def
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where n.nspname = 'public' and c.relkind = 'r'
  union all
  select 'constraint', cl.relname || '.' || c.conname, pg_get_constraintdef(c.oid)
  from pg_constraint c join pg_class cl on cl.oid = c.conrelid
  join pg_namespace n on n.oid = c.connamespace
  where n.nspname = 'public' and c.contype <> 'n' -- PG 18 : NOT NULL dans pg_constraint
  union all
  select 'index', ic.relname::text, pg_get_indexdef(i.indexrelid)
  from pg_index i join pg_class ic on ic.oid = i.indexrelid
  join pg_namespace n on n.oid = ic.relnamespace where n.nspname = 'public'
  union all
  select 'enum', t.typname::text, string_agg(e.enumlabel, ',' order by e.enumsortorder)
  from pg_type t join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public'
  group by t.typname
  union all
  select 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'secdef=' || p.prosecdef || ' config=' || coalesce(array_to_string(p.proconfig, ';'), '-')
           || ' execute=' || coalesce(f.privs, '-') || ' md5=' || md5(pg_get_functiondef(p.oid))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  left join facl f on f.oid = p.oid where n.nspname = 'public'
  union all
  select 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and n.nspname in ('public', 'auth')
  union all
  select 'rls', c.relname::text, 'enabled=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  union all
  select 'policy', tablename || '.' || policyname,
         permissive || ' ' || cmd || ' to ' || array_to_string(roles, ',')
           || ' using=' || coalesce(qual, '-') || ' check=' || coalesce(with_check, '-')
  from pg_policies where schemaname = 'public'
  union all
  select 'grant', rel, privs from acl
) s order by kind, name`;

// Une ligne par catégorie : nombre d'objets + md5 de (nom = md5(définition)).
export const HASH_SQL = `select kind, count(*)::int as n,
  md5(string_agg(name || '=' || md5(def), '|' order by name collate "C")) as hash
from (${SNAPSHOT_SQL}) snap group by kind order by kind`;

const PLATFORM_STUBS = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists extensions;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`;

async function loadPGlite() {
  const candidates = [];
  if (process.env.PGLITE_DIR) {
    const base = join(process.env.PGLITE_DIR, "node_modules", "@electric-sql", "pglite", "dist");
    candidates.push([pathToFileURL(join(base, "index.js")).href,
      pathToFileURL(join(base, "contrib", "pgcrypto.js")).href,
      pathToFileURL(join(base, "contrib", "uuid_ossp.js")).href]);
  }
  candidates.push(["@electric-sql/pglite", "@electric-sql/pglite/contrib/pgcrypto",
    "@electric-sql/pglite/contrib/uuid_ossp"]);
  for (const [main, crypto, uuid] of candidates) {
    try {
      const { PGlite } = await import(main);
      const { pgcrypto } = await import(crypto);
      const { uuid_ossp } = await import(uuid);
      return new PGlite({ extensions: { pgcrypto, uuid_ossp } });
    } catch { /* candidat suivant */ }
  }
  console.error("PGlite introuvable : voir l'usage en tête du script (PGLITE_DIR).");
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes("--print-query")) { console.log(SNAPSHOT_SQL.trim() + ";"); return; }
  if (args.includes("--print-hash-query")) { console.log(HASH_SQL.trim() + ";"); return; }

  const db = await loadPGlite();
  await db.exec(PLATFORM_STUBS);

  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => join(MIGRATIONS, f));
  for (const file of [...files, SEED]) {
    try {
      await db.exec(readFileSync(file, "utf8"));
      console.log(`OK   ${file.slice(ROOT.length + 1)}`);
    } catch (e) {
      console.error(`FAIL ${file.slice(ROOT.length + 1)} : ${e.message}`);
      process.exit(1);
    }
  }

  const { rows } = await db.query(SNAPSHOT_SQL);
  const { rows: hashes } = await db.query(HASH_SQL);
  console.log("Empreintes du schéma (à comparer avec --print-hash-query sur la prod) :");
  for (const h of hashes) console.log(`  ${h.kind.padEnd(10)} ${String(h.n).padStart(3)}  ${h.hash}`);

  const out = opt("--out");
  if (out) writeFileSync(out, JSON.stringify(rows, null, 2));

  const ref = opt("--compare");
  if (!ref) return;
  const key = (r) => `${r.kind} ${r.name}`;
  const local = new Map(rows.map((r) => [key(r), r.def]));
  const prod = new Map(JSON.parse(readFileSync(ref, "utf8")).map((r) => [key(r), r.def]));
  let diffs = 0;
  for (const [k, def] of prod) {
    if (!local.has(k)) { diffs++; console.log(`- absent en local : ${k}\n    prod : ${def}`); }
    else if (local.get(k) !== def) {
      diffs++; console.log(`~ différent : ${k}\n    prod  : ${def}\n    local : ${local.get(k)}`);
    }
  }
  for (const [k, def] of local) {
    if (!prod.has(k)) { diffs++; console.log(`+ en trop en local : ${k}\n    local : ${def}`); }
  }
  console.log(diffs === 0 ? "Aucun écart avec la référence." : `${diffs} écart(s).`);
  if (diffs > 0) process.exit(1);
}

main();
