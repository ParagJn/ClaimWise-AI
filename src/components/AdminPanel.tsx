import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RotateCcw, RefreshCw } from 'lucide-react';

interface AdminPanelProps {
  onReset: () => void;
  onReload?: () => void; // Optional for now
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onReset, onReload }) => {
  const handleReload = () => {
    if (onReload) {
      onReload();
    } else {
      window.location.reload();
    }
  };

  return (
    <Card className="mt-8 shadow-lg border-t-4 border-muted-foreground">
      <CardHeader>
        <CardTitle className="text-xl font-headline text-muted-foreground">Admin Panel</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
        <Button variant="outline" onClick={onReset} className="w-full sm:w-auto">
          <RotateCcw className="mr-2 h-4 w-4" /> Reset Claim Process
        </Button>
        <Button variant="outline" onClick={handleReload} className="w-full sm:w-auto">
          <RefreshCw className="mr-2 h-4 w-4" /> Reload Application
        </Button>
      </CardContent>
    </Card>
  );
};

export default AdminPanel;
