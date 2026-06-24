import React, { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if dismissed previously
    if (localStorage.getItem('nudge_install_dismissed') === 'true') {
      return;
    }

    // Check standalone mode
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in window.navigator && (window.navigator as any).standalone);
    setIsStandalone(isStandaloneMode);

    if (isStandaloneMode) {
      return;
    }

    // iOS detection
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    if (isIOSDevice) {
      setShowPrompt(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    const handleAppInstalled = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
      console.log('Nudge was successfully installed.');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    } else {
      console.log('User dismissed the install prompt');
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('nudge_install_dismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 z-50 animate-fade-in sm:top-0 sm:bottom-auto">
      <div className="max-w-md mx-auto bg-black text-white rounded-xl p-4 shadow-2xl flex items-center gap-4 relative overflow-hidden">
        <div className="w-12 h-12 bg-white flex items-center justify-center rounded-lg flex-shrink-0">
          <span className="text-black font-serif font-black text-2xl leading-none">N</span>
        </div>
        <div className="flex-1">
          <h4 className="font-bold font-headline text-sm uppercase tracking-wide">Install Nudge</h4>
          {isIOS ? (
            <p className="text-xs text-zinc-400 mt-1">To install: tap the Share button <span className="material-symbols-outlined text-[12px] inline-block align-middle">ios_share</span> then "Add to Home Screen"</p>
          ) : (
            <p className="text-xs text-zinc-400 mt-1">Add to your home screen for the best experience.</p>
          )}
        </div>
        {!isIOS && (
          <div className="flex flex-col gap-2 flex-shrink-0">
            <button
              onClick={handleInstallClick}
              className="px-4 py-1.5 bg-white text-black text-xs font-bold uppercase rounded hover:bg-zinc-200 transition-colors"
            >
              Install
            </button>
            <button
              onClick={handleDismiss}
              className="px-4 py-1.5 text-zinc-400 text-[10px] font-bold uppercase hover:text-white transition-colors"
            >
              Not Now
            </button>
          </div>
        )}
        {isIOS && (
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 text-zinc-500 hover:text-white p-1"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        )}
      </div>
    </div>
  );
}
