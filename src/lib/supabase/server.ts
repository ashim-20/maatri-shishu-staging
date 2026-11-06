import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isConfigured, supabaseKey, supabaseUrl } from "@/lib/config";
export async function createServerSupabase() {
  if (!isConfigured) throw new Error("Supabase is not configured.");
  const jar = await cookies();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, {
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
              path: "/",
            }),
          );
        } catch {
          /* The proxy refreshes cookies before Server Components render. */
        }
      },
    },
  });
}
