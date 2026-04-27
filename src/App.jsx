import { useEffect, useState } from 'react';
import Login from './components/Login.jsx';
import { supabaseClient } from './lib/supabase.js';
import { notifyAuthSession } from './lib/authBridge.js';

export default function App() {
    const [session, setSession] = useState(null);

    useEffect(() => {
        let cancelled = false;

        supabaseClient.auth
            .getSession()
            .then(({ data: { session: s } }) => {
                if (cancelled) return;
                setSession(s);
                notifyAuthSession(s);
            })
            .catch(() => {
                if (cancelled) return;
                setSession(null);
                notifyAuthSession(null);
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

    if (session) {
        return null;
    }

    return <Login />;
}
