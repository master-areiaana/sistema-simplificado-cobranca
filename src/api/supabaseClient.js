import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!configured) {
  console.warn('[dados] Supabase não configurado (faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Sistema usará apenas o armazenamento local deste navegador.');
}

export const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export function isSupabaseConfigured() {
  return configured;
}
