import { createClient } from '@supabase/supabase-js';

/* La URL y la anon key se leen SOLO de variables de entorno
   (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). No se hardcodean credenciales
   en el repositorio — definilas en un archivo .env (ver README). */

function getProcessEnv(key) {
    try {
        if (typeof process !== 'undefined' && process.env && typeof process.env[key] === 'string') {
            return process.env[key];
        }
    } catch {
        /* noop */
    }
    return undefined;
}

function readEnv(key) {
    const raw =
        (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) ||
        getProcessEnv(key);
    if (raw == null || typeof raw !== 'string') return '';
    return raw.trim().replace(/^['"]|['"]$/g, '');
}

function resolveSupabaseUrl() {
    let u = readEnv('VITE_SUPABASE_URL');
    if (!u) {
        throw new Error(
            'Falta VITE_SUPABASE_URL. Definila en el archivo .env (ver README).',
        );
    }
    if (!/^https?:\/\//i.test(u)) {
        u = `https://${u.replace(/^\/+/, '')}`;
    }
    const parsed = new URL(u); // lanza si es inválida
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`VITE_SUPABASE_URL inválida: ${u}`);
    }
    return u;
}

function resolveAnonKey() {
    const k = readEnv('VITE_SUPABASE_ANON_KEY');
    if (!k) {
        throw new Error(
            'Falta VITE_SUPABASE_ANON_KEY. Definila en el archivo .env (ver README).',
        );
    }
    return k;
}

export const supabaseClient = createClient(
    resolveSupabaseUrl(),
    resolveAnonKey(),
);
