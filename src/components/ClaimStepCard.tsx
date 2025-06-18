import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, CheckCircle, Mail, Info } from 'lucide-react';

interface ClaimStepCardProps {
  stepNumber: number;
  title: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error' | 'info';
  aiSummary: React.ReactNode;
  actionButton?: {
    text: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
  children?: React.ReactNode;
  borderColorClass: string;
}

const statusIcons = {
  pending: <Info className="h-5 w-5 text-muted-foreground" />,
  'in-progress': <Loader2 className="h-5 w-5 animate-spin text-primary" />,
  completed: <CheckCircle className="h-5 w-5 text-google-green" />,
  error: <AlertCircle className="h-5 w-5 text-google-red" />,
  info: <Mail className="h-5 w-5 text-google-yellow" />,
};

const ClaimStepCard: React.FC<ClaimStepCardProps> = ({
  stepNumber,
  title,
  status,
  aiSummary,
  actionButton,
  children,
  borderColorClass,
}) => {
  return (
    <Card className={`shadow-xl transition-all duration-300 ease-in-out border-t-4 ${borderColorClass} mb-6`}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl font-headline">
            Step {stepNumber}: {title}
          </CardTitle>
          {statusIcons[status]}
        </div>
        <CardDescription className="text-sm">
          Current status of this validation step.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {children && <div className="p-4 border rounded-md bg-secondary/30">{children}</div>}
        
        <div className="p-4 border rounded-md bg-primary/5 border-primary/20">
          <h4 className="text-lg font-semibold font-headline mb-2 text-primary">AI Agent Summary</h4>
          <div className="text-sm text-foreground space-y-1 prose prose-sm max-w-none">
            {aiSummary}
          </div>
        </div>
      </CardContent>
      {actionButton && (
        <CardFooter className="pt-4">
          <Button
            size="lg"
            onClick={actionButton.onClick}
            disabled={actionButton.disabled || actionButton.loading}
            className="w-full md:w-auto ml-auto shadow-md hover:shadow-lg transition-shadow"
          >
            {actionButton.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {actionButton.text}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};

export default ClaimStepCard;
