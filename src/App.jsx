import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Login from './components/Login.jsx';
import { supabaseClient } from './lib/supabase.js';
import { notifyAuthSession } from './lib/authBridge.js';

export default function App() {
    const [session, setSession] = useState(null);

    useEffect(() => {
        let cancelled = false;

        supabaseClient.auth.getSession().then(({ data: { session: s } }) => {
            if (cancelled) return;
            setSession(s);
            notifyAuthSession(s);
        });

        const {
            data: { subscription },
        } = supabaseClient.auth.onAuthStateChange((_event, s) => {
            setSession(s);
            notifyAuthSession(s);
        });

        return () => {
            cancelled = true;
            subscription.unsubscribe();
        };
    }, []);

    const mount =
        typeof document !== 'undefined'
            ? document.getElementById('login-portal-target')
            : null;

    if (!mount) {
        return null;
    }

    if (session) {
        return null;
    }

    return createPortal(<Login />, mount);
}
