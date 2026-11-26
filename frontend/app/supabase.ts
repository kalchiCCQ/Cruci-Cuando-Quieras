import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase = url && key ? createClient(url, key) : null;

export async function accessToken(captchaToken?: string) {
  if (!supabase) throw new Error("Faltan las variables públicas de Supabase.");
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.access_token) return sessionData.session.access_token;
  const { data, error } = await supabase.auth.signInAnonymously({
    options: captchaToken ? { captchaToken } : undefined,
  });
  if (error || !data.session?.access_token) throw error ?? new Error("No se pudo iniciar la sesión.");
  return data.session.access_token;
}
