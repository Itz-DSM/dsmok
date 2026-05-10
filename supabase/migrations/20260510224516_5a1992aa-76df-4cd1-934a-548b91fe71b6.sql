
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop policy if exists "videos_public_read" on storage.objects;
drop policy if exists "avatars_public_read" on storage.objects;
