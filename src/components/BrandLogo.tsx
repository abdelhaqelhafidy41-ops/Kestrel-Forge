import React from 'react';

interface BrandLogoProps {
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ className = 'w-7 h-7' }) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <rect width="64" height="64" rx="14" className="fill-zinc-900 dark:fill-zinc-900" />
    <rect
      x="2"
      y="2"
      width="60"
      height="60"
      rx="12"
      stroke="url(#kf_brand_grad)"
      strokeOpacity="0.45"
      strokeWidth="2"
    />
    <path d="M16 44L32 14L48 44H38L32 31L26 44H16Z" fill="url(#kf_brand_grad)" />
    <path d="M24 44L32 36L40 44L32 51L24 44Z" fill="#22D3EE" fillOpacity="0.9" />
    <defs>
      <linearGradient id="kf_brand_grad" x1="16" y1="14" x2="48" y2="51" gradientUnits="userSpaceOnUse">
        <stop stopColor="#6366F1" />
        <stop offset="1" stopColor="#22D3EE" />
      </linearGradient>
    </defs>
  </svg>
);
