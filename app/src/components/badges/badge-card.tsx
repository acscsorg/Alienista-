'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { buildBadgeData, buildBadgeFilename } from '@/lib/badges/badge';
import type { BadgeStudent } from '@/lib/types/models';
import { getStudentGoogleWalletUrlAction } from '@/lib/actions/google-wallet';
import { BadgeArtwork } from '@/components/badges/badge-artwork';
import type { BadgeArtworkAssets } from '@/lib/badges/artwork';

function GoogleWalletEmblem() {
  return (
    <svg className="w-6 h-5 shrink-0" viewBox="0 0 36 30" fill="none" aria-hidden="true">
      <path d="M36 11.291H0V5.6456C0 2.5809 2.6422 0 5.7798 0H30.2202C33.3578 0 36 2.5809 36 5.6456V11.291Z" fill="#34A853" />
      <path d="M36 16.5H0V10.5C0 7.2429 2.6422 4.5 5.7798 4.5H30.2202C33.3578 4.5 36 7.2429 36 10.5V16.5Z" fill="#FBBC04" />
      <path d="M36 21.5H0V15.5C0 12.2429 2.6422 9.5 5.7798 9.5H30.2202C33.3578 9.5 36 12.2429 36 15.5V21.5Z" fill="#EA4335" />
      <path d="M0 12.7409L22.8493 17.9025C25.4795 18.5477 28.4384 17.9025 30.5753 16.2895L36 12.4183V24.5157C36 27.5804 33.3699 30 30.2466 30H5.7534C2.6301 30 0 27.5804 0 24.5157V12.7409Z" fill="#4285F4" />
    </svg>
  );
}

export function BadgeCard({
  student,
  showDownload = true,
  walletSaveUrl = null,
  showWalletButton = false,
}: {
  student: BadgeStudent;
  showDownload?: boolean;
  walletSaveUrl?: string | null;
  showWalletButton?: boolean;
}) {
  const badge = useMemo(() => buildBadgeData(student), [student]);
  const [badgeDataUrl, setBadgeDataUrl] = useState('');
  const [artworkAssets, setArtworkAssets] = useState<BadgeArtworkAssets>({ qrDataUrl: null, avatarDataUrl: null });
  const [renderError, setRenderError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    import('@/lib/badges/render-badge')
      .then(async ({ buildBadgeArtworkAssets, renderBadgeToDataUrl }) => {
        const assets = await buildBadgeArtworkAssets(badge);
        const url = await renderBadgeToDataUrl(badge, assets);
        if (active) {
          setArtworkAssets(assets);
          setBadgeDataUrl(url);
        }
      })
      .catch(() => {
        if (active) setRenderError(true);
      });
    return () => {
      active = false;
    };
  }, [badge]);

  const handleDownload = () => {
    if (!badgeDataUrl) return;
    const link = document.createElement('a');
    link.download = buildBadgeFilename(badge);
    link.href = badgeDataUrl;
    link.click();
  };

  const handleDynamicWalletClick = () => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const res = await getStudentGoogleWalletUrlAction(student.id);
        if (res.success) {
          if (res.data?.url) {
            window.open(res.data.url, '_blank', 'noopener,noreferrer');
            if (res.message) setErrorMessage(res.message);
          } else {
            setErrorMessage('Google Wallet pass URL was not returned.');
          }
        } else {
          setErrorMessage(res.error || 'Failed to generate Google Wallet pass.');
        }
      } catch {
        setErrorMessage('Unable to generate pass. Please check your network or server configuration.');
      }
    });
  };

  const shouldShowWallet = Boolean(walletSaveUrl || showWalletButton);

  return (
    <div className="bg-white border border-[#E5EBE5] rounded-lg overflow-hidden shadow-md max-w-sm mx-auto">
      <div className="relative aspect-[5/8] bg-[#F8FAF9] flex items-center justify-center">
        <BadgeArtwork badge={badge} assets={artworkAssets} />
        {renderError && <div className="absolute inset-0 flex items-center justify-center bg-white/85 px-6 text-center text-xs text-red-700">Badge rendering failed. Reload and try again.</div>}
      </div>

      {(showDownload || shouldShowWallet) && (
        <div className="p-3 bg-[#F8FAF9] border-t border-[#E5EBE5] space-y-2">
          {showDownload && (
            <button
              onClick={handleDownload}
              disabled={!badgeDataUrl}
              className="w-full py-2.5 bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors shadow-xs disabled:opacity-40 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download Badge PNG</span>
            </button>
          )}

          {walletSaveUrl ? (
            <a
              href={walletSaveUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Add to Google Wallet"
              className="w-full h-12 bg-[#1F1F1F] hover:bg-[#2F2F2F] active:bg-[#000000] text-white font-medium rounded-full text-xs sm:text-sm flex items-center justify-center gap-3 transition-all shadow-sm border border-black/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1F1F1F]"
            >
              <GoogleWalletEmblem />
              <span>Add to Google Wallet</span>
            </a>
          ) : shouldShowWallet ? (
            <div>
              <button
                type="button"
                onClick={handleDynamicWalletClick}
                disabled={isPending}
                aria-label="Add to Google Wallet"
                className="w-full h-12 bg-[#1F1F1F] hover:bg-[#2F2F2F] active:bg-[#000000] text-white font-medium rounded-full text-xs sm:text-sm flex items-center justify-center gap-3 transition-all shadow-sm border border-black/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1F1F1F] disabled:opacity-60 cursor-pointer"
              >
                {isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin shrink-0 text-white" />
                ) : (
                  <GoogleWalletEmblem />
                )}
                <span>{isPending ? 'Adding to Google Wallet...' : 'Add to Google Wallet'}</span>
              </button>
              {errorMessage && (
                <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-center">
                  {errorMessage}
                </p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
