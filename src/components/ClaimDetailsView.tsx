import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ClaimDetailsViewProps {
  data: object | null | undefined;
  title?: string;
}

const ClaimDetailsView: React.FC<ClaimDetailsViewProps> = ({ data, title = "Claim Data" }) => {
  if (!data) {
    return <p className="text-sm text-muted-foreground">No data available.</p>;
  }

  return (
    <div className="space-y-2">
      <h5 className="text-md font-semibold font-headline">{title}</h5>
      <ScrollArea className="h-64 w-full rounded-md border p-3 bg-background">
        <pre className="text-xs whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      </ScrollArea>
    </div>
  );
};

export default ClaimDetailsView;
