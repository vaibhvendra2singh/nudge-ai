import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register offline-ready Service Worker
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[Service Worker] Scope:', reg.scope);
        
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // Show update banner
                const updateBanner = document.createElement('div');
                updateBanner.style.position = 'fixed';
                updateBanner.style.bottom = '20px';
                updateBanner.style.left = '50%';
                updateBanner.style.transform = 'translateX(-50%)';
                updateBanner.style.backgroundColor = '#000';
                updateBanner.style.color = '#fff';
                updateBanner.style.padding = '12px 24px';
                updateBanner.style.borderRadius = '8px';
                updateBanner.style.zIndex = '9999';
                updateBanner.style.display = 'flex';
                updateBanner.style.alignItems = 'center';
                updateBanner.style.gap = '12px';
                updateBanner.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
                updateBanner.style.fontFamily = 'Inter, sans-serif';
                updateBanner.style.fontSize = '14px';
                
                updateBanner.innerHTML = `
                  <span>A new version of Nudge is available.</span>
                  <button id="refresh-update" style="background:#fff;color:#000;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;text-transform:uppercase;">Refresh</button>
                `;
                
                document.body.appendChild(updateBanner);
                
                document.getElementById('refresh-update')?.addEventListener('click', () => {
                  window.location.reload();
                });
              }
            });
          }
        });
      })
      .catch((err) => {
        console.error('[Service Worker] Register error:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
