import { config } from 'dotenv';
config();

import '@/ai/flows/generate-missing-info-email.ts';
import '@/ai/flows/generate-claim-summary.ts';
import '@/ai/flows/highlight-claim-inconsistencies.ts';
import '@/ai/flows/extract-and-fill-claim-data.ts';