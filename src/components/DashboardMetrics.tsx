import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, AlertTriangle, CheckCircle, FileText, Settings2 } from 'lucide-react';

interface MetricProps {
  title: string;
  value: number | string;
  icon: React.ElementType;
  colorClass: string;
}

const MetricCard: React.FC<MetricProps> = ({ title, value, icon: Icon, colorClass }) => (
  <Card className={`shadow-lg border-l-4 ${colorClass}`}>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      <Icon className="h-5 w-5 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-bold font-headline">{value}</div>
    </CardContent>
  </Card>
);

interface DashboardMetricsProps {
  totalClaims: number;
  processingClaims: number;
  validatedClaims: number;
  rejectedClaims: number;
}

const DashboardMetrics: React.FC<DashboardMetricsProps> = ({
  totalClaims,
  processingClaims,
  validatedClaims,
  rejectedClaims,
}) => {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
      <MetricCard title="Total Claims Submitted" value={totalClaims} icon={FileText} colorClass="border-google-blue" />
      <MetricCard title="Claims Being Processed" value={processingClaims} icon={Settings2} colorClass="border-google-yellow" />
      <MetricCard title="Validated Claims" value={validatedClaims} icon={CheckCircle} colorClass="border-google-green" />
      <MetricCard title="Rejected Claims" value={rejectedClaims} icon={AlertTriangle} colorClass="border-google-red" />
    </div>
  );
};

export default DashboardMetrics;
