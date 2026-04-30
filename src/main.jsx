import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

const rootEl = document.getElementById('react-root');
if (!rootEl) {
    throw new Error('Falta #react-root en index.html');
}

ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
