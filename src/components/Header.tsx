import React from 'react';
import ClaimWiseLogo from './ClaimWiseLogo';

const Header = () => {
  return (
    <header className="bg-card text-card-foreground shadow-md sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <ClaimWiseLogo className="h-10 w-10" />
          <h1 className="text-2xl font-headline font-semibold text-primary">
            ClaimWise AI
          </h1>
        </div>
        {/* Future: User Profile / Theme Toggle */}
      </div>
    </header>
  );
};

export default Header;
