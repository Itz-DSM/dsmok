
-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare base text; final text; n int := 0;
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)), '[^a-z0-9_]', '', 'g'));
  if base = '' or base is null then base := 'user'; end if;
  final := base;
  while exists(select 1 from public.profiles where username = final) loop
    n := n + 1; final := base || n::text;
  end loop;
  insert into public.profiles (id, username, display_name)
  values (new.id, final, coalesce(new.raw_user_meta_data->>'display_name', final));
  return new;
end; $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- VIDEOS
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  caption text,
  video_url text not null,
  thumbnail_url text,
  duration_seconds numeric,
  created_at timestamptz not null default now()
);
alter table public.videos enable row level security;
create policy "videos_select_all" on public.videos for select using (true);
create policy "videos_insert_own" on public.videos for insert with check (auth.uid() = user_id);
create policy "videos_update_own" on public.videos for update using (auth.uid() = user_id);
create policy "videos_delete_own" on public.videos for delete using (auth.uid() = user_id);
create index videos_user_id_idx on public.videos(user_id);
create index videos_created_at_idx on public.videos(created_at desc);

-- LIKES
create table public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
alter table public.likes enable row level security;
create policy "likes_select_all" on public.likes for select using (true);
create policy "likes_insert_own" on public.likes for insert with check (auth.uid() = user_id);
create policy "likes_delete_own" on public.likes for delete using (auth.uid() = user_id);

-- COMMENTS
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.comments enable row level security;
create policy "comments_select_all" on public.comments for select using (true);
create policy "comments_insert_own" on public.comments for insert with check (auth.uid() = user_id);
create policy "comments_delete_own" on public.comments for delete using (auth.uid() = user_id);
create index comments_video_id_idx on public.comments(video_id);

-- FOLLOWS
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
alter table public.follows enable row level security;
create policy "follows_select_all" on public.follows for select using (true);
create policy "follows_insert_own" on public.follows for insert with check (auth.uid() = follower_id);
create policy "follows_delete_own" on public.follows for delete using (auth.uid() = follower_id);

-- STORAGE BUCKETS
insert into storage.buckets (id, name, public) values ('videos','videos',true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('avatars','avatars',true) on conflict do nothing;

create policy "videos_public_read" on storage.objects for select using (bucket_id = 'videos');
create policy "videos_user_upload" on storage.objects for insert with check (bucket_id='videos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "videos_user_update" on storage.objects for update using (bucket_id='videos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "videos_user_delete" on storage.objects for delete using (bucket_id='videos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "avatars_public_read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars_user_upload" on storage.objects for insert with check (bucket_id='avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars_user_update" on storage.objects for update using (bucket_id='avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars_user_delete" on storage.objects for delete using (bucket_id='avatars' and auth.uid()::text = (storage.foldername(name))[1]);
