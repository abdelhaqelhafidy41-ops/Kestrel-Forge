import React, { useState } from 'react';
import { Layers } from 'lucide-react';

interface ImageWithFallbackProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}

export const ImageWithFallback: React.FC<ImageWithFallbackProps> = ({
  src,
  alt,
  className = '',
  fallbackTitle,
}) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-900 dark:to-zinc-950 text-zinc-500 dark:text-zinc-400 select-none ${className}`}
        role="img"
        aria-label={alt}
      >
        <Layers className="w-8 h-8 mb-2 opacity-60" strokeWidth={1.5} />
        {fallbackTitle ? (
          <span className="text-xs font-medium px-4 text-center line-clamp-1">{fallbackTitle}</span>
        ) : null}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
      loading="lazy"
    />
  );
};
