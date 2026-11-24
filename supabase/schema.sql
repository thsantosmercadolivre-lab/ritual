-- Ritual · app da Andresa Alves
-- Cole tudo no Supabase: SQL Editor > New query > Run. Pode rodar de novo sem quebrar nada.

-- Uma linha por pessoa cadastrada.
create table if not exists public.profiles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  nome      text not null default '',
  email     text not null default '',
  criado_em timestamptz not null default now()
);

-- Um registro por pessoa por dia.
create table if not exists public.entries (
  user_id       uuid not null references auth.users(id) on delete cascade,
  dia           date not null,
  h             jsonb not null default '{}'::jsonb,  -- hábitos marcados
  s             jsonb not null default '{}'::jsonb,  -- escalas de 1 a 5
  n             jsonb not null default '{}'::jsonb,  -- os porquês
  closed        boolean not null default false,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, dia)
);

-- Quem vê o painel (a Andresa).
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Quando alguém cria a conta, o perfil nasce sozinho com o nome.
create or replace function public.novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', ''), coalesce(new.email, ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.novo_usuario();

alter table public.profiles enable row level security;
alter table public.entries  enable row level security;
alter table public.admins   enable row level security;

drop policy if exists "perfil: ver o seu ou admin" on public.profiles;
create policy "perfil: ver o seu ou admin" on public.profiles
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "perfil: editar o seu" on public.profiles;
create policy "perfil: editar o seu" on public.profiles
  for update using (user_id = auth.uid());

drop policy if exists "dias: ver os seus ou admin" on public.entries;
create policy "dias: ver os seus ou admin" on public.entries
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "dias: criar os seus" on public.entries;
create policy "dias: criar os seus" on public.entries
  for insert with check (user_id = auth.uid());
drop policy if exists "dias: editar os seus" on public.entries;
create policy "dias: editar os seus" on public.entries
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "admins: ver o seu" on public.admins;
create policy "admins: ver o seu" on public.admins
  for select using (user_id = auth.uid());

-- Acesso pela API só para quem está logado (as políticas acima filtram o resto).
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.entries to authenticated;
grant select on public.admins to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Painel em tempo real.
do $$ begin
  alter publication supabase_realtime add table public.entries;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null; end $$;

-- Depois que a Andresa criar a conta dela no app, rode isto (trocando o e-mail):
-- insert into public.admins (user_id) select id from auth.users where email = 'EMAIL_DA_ANDRESA' on conflict do nothing;
