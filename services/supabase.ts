
import { createClient } from '@supabase/supabase-js';

// As variáveis de ambiente do Supabase fornecidas pelo usuário
const supabaseUrl = (process.env as any).SUPABASE_URL || 'https://rsofjllvrutlnmkyktix.supabase.co';
const supabaseAnonKey = (process.env as any).SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzb2ZqbGx2cnV0bG5ta3lrdGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NTcxOTMsImV4cCI6MjA4MzUzMzE5M30.KYmeKkV0VCJH7MKSYklfBP8NEET0w5R4w1shmqhbDGA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const checkSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};
