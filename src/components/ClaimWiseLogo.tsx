import React from 'react';

const ClaimWiseLogo = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="48"
    height="48"
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="ClaimWise AI Logo"
  >
    <rect width="48" height="48" rx="8" fill="hsl(var(--primary))" />
    <path
      d="M12 24L19 31L36 14"
      stroke="hsl(var(--primary-foreground))"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="34" cy="34" r="3" fill="hsl(var(--google-yellow))" />
    <circle cx="14" cy="14" r="2" fill="hsl(var(--google-green))" />
  </svg>
);

export default ClaimWiseLogo;
