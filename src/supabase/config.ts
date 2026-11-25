/**
 * ==========================================
 * File: src/supabase/config.ts
 * Project: AdBoard V3
 * Purpose:
 * Initialises current Supabase client instance
 * and connection helpers.
 * ==========================================
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseBackend = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseBackend
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
