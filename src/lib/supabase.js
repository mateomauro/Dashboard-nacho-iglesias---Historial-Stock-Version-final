import { createClient } from '@supabase/supabase-js';

const url =
    import.meta.env.VITE_SUPABASE_URL ||
    'https://urquftsucjtqxogjjhhx.supabase.co';
const anonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXVmdHN1Y2p0cXhvZ2pqaGh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NjQ3MjMsImV4cCI6MjA4NzQ0MDcyM30.GJu2UaYFqQAXMgghQY1Xag62tKecNG8hk-nzsvYKdzE';

export const supabaseClient = createClient(url, anonKey);
