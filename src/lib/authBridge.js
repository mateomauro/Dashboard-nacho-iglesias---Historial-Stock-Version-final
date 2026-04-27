/** @type {((session: import('@supabase/supabase-js').Session | null) => void) | null} */
let authUiHandler = null;

export function setAuthUiHandler(fn) {
    authUiHandler = fn;
}

export function notifyAuthSession(session) {
    if (authUiHandler) authUiHandler(session);
}
