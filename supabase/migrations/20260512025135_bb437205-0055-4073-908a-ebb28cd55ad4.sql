
REVOKE EXECUTE ON FUNCTION public.is_platform_owner(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_on_like() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_on_follow() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_on_comment() FROM anon, authenticated, public;
