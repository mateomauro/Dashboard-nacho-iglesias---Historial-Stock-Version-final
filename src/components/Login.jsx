import React, { useState } from 'react';
import { supabaseClient } from '../lib/supabase.js';

export default function Login() {
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();
        setError('');

        const form = event.currentTarget;
        const email = form.email.value;
        const password = form.password.value;

        try {
            setSubmitting(true);
            const { error: signError } = await supabaseClient.auth.signInWithPassword({
                email,
                password,
            });
            if (signError) throw signError;
        } catch (err) {
            setError('Error: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div id="login-screen" className="login-container">
            <div className="login-card">
                <div className="login-logo" aria-hidden="true">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <line x1="18" y1="20" x2="18" y2="10" />
                        <line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                </div>
                <div className="login-header">
                    <h1>Panel de Control</h1>
                    <p>Ingresa tus credenciales para continuar</p>
                </div>
                <form id="login-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            placeholder="tu@email.com"
                            required
                            autoComplete="email"
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Contraseña</label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            placeholder="••••••••"
                            required
                            autoComplete="current-password"
                        />
                    </div>
                    <div
                        id="login-error"
                        className={'error-message' + (error ? ' show' : '')}
                        role="alert"
                        aria-live="polite"
                    >
                        {error}
                    </div>
                    <button type="submit" className="btn-primary" disabled={submitting}>
                        {submitting ? 'Iniciando...' : 'Iniciar Sesión'}
                    </button>
                </form>
            </div>
        </div>
    );
}
