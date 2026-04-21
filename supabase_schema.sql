-- Colle ce SQL dans l'éditeur SQL de ton projet Supabase
-- (https://app.supabase.com > SQL Editor)

create table if not exists jobs (
  id          uuid primary key default gen_random_uuid(),
  external_id text not null,          -- identifiant unique construit depuis l'URL
  source      text not null,          -- jobup | jobs_ch | swissdev | indeed | emploi_it
  title       text not null,
  company     text,
  city        text,
  region      text,
  contract    text,                   -- CDI | CDD | Freelance | Stage
  remote      text,                   -- Remote | Hybride | Sur site
  salary      text,
  description text,
  tags        text[],                 -- tableau de technologies
  url         text not null,
  posted_at   timestamptz,
  scraped_at  timestamptz default now(),
  is_active   boolean default true,
  unique(external_id, source)
);

-- Index pour les recherches fréquentes
create index if not exists jobs_source_idx      on jobs(source);
create index if not exists jobs_city_idx        on jobs(city);
create index if not exists jobs_contract_idx    on jobs(contract);
create index if not exists jobs_scraped_at_idx  on jobs(scraped_at desc);
create index if not exists jobs_is_active_idx   on jobs(is_active);

-- Activer la lecture publique (anonyme) via l'API Supabase
alter table jobs enable row level security;
create policy "Public read" on jobs for select using (true);
create policy "Service insert" on jobs for insert with check (true);
create policy "Service update" on jobs for update using (true);
