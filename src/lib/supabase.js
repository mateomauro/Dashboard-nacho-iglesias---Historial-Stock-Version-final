import { createClient } from '@supabase/supabase-js';

const DEFAULT_URL = 'https://urquftsucjtqxogjjhhx.supabase.co';
const DEFAULT_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXVmdHN1Y2p0cXhvZ2pqaGh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NjQ3MjMsImV4cCI6MjA4NzQ0MDcyM30.GJu2UaYFqQAXMgghQY1Xag62tKecNG8hk-nzsvYKdzE';

function resolveSupabaseUrl() {
    const raw = import.meta.env.VITE_SUPABASE_URL;
    if (raw == null || typeof raw !== 'string') return DEFAULT_URL;
    let u = raw.trim().replace(/^['"]|['"]$/g, '');
    if (!u) return DEFAULT_URL;
    if (!/^https?:\/\//i.test(u)) {
        u = `https://${u.replace(/^\/+/, '')}`;
    }
    try {
        const parsed = new URL(u);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return DEFAULT_URL;
        }
        return u;
    } catch {
        return DEFAULT_URL;
    }
}

function resolveAnonKey() {
    const raw = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (raw == null || typeof raw !== 'string') return DEFAULT_ANON_KEY;
    const k = raw.trim().replace(/^['"]|['"]$/g, '');
    return k || DEFAULT_ANON_KEY;
}

export const supabaseClient = createClient(
    resolveSupabaseUrl(),
    resolveAnonKey()
);
