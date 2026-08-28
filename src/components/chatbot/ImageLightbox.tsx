import { useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

/**
 * Full-screen viewer for an image sent in a conversation.
 *
 * Clicking an attachment used to open its raw URL in a new tab, which dropped
 * the person out of the app mid-conversation and — because the bucket is
 * private — showed them a bare signed URL. A modal keeps them where they were.
 */
export default function ImageLightbox({ src, alt, onClose }: Props) {
  useEffect(() => {
    if (!src) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);

    // Nothing behind the overlay should scroll while it is up. Restoring the
    // PREVIOUS value rather than clearing it matters: the chatbot page already
    // locks the body, and clearing would hand it back unlocked.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Attached image'}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image"
        className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Clicking the backdrop closes; clicking the image itself must not, so
          the picture can be looked at without it vanishing under the cursor. */}
      <img
        src={src}
        alt={alt || 'Attached image'}
        onClick={(event) => event.stopPropagation()}
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
      />
    </div>
  );
}
