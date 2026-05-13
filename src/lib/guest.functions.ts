import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const createGuestAccount = createServerFn({ method: "POST" }).handler(async () => {
  const stamp = Date.now();
  const email = `guest_${stamp}@guest.dsmok.local`;
  const password = `Guest!${stamp}aA`;
  const username = `guest${String(stamp).slice(-6)}`;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      display_name: "Guest",
    },
  });

  if (error) throw error;
  return { email, password, userId: data.user.id };
});