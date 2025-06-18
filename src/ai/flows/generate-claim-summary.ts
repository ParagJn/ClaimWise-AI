'use server';

/**
 * @fileOverview Generates a concise decision summary (Approved/Rejected) and a comparison of the claim and settlement amounts using GenAI.
 *
 * - generateClaimSummary - A function that handles the claim summary generation process.
 * - GenerateClaimSummaryInput - The input type for the generateClaimSummary function.
 * - GenerateClaimSummaryOutput - The return type for the generateClaimSummary function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateClaimSummaryInputSchema = z.object({
  claimAmount: z.number().describe('The amount claimed.'),
  settlementAmount: z.number().describe('The amount to be settled.'),
  isEligible: z.boolean().describe('Whether the claim is eligible.'),
  reason: z.string().describe('The reasoning behind the eligibility decision.'),
});
export type GenerateClaimSummaryInput = z.infer<typeof GenerateClaimSummaryInputSchema>;

const GenerateClaimSummaryOutputSchema = z.object({
  decision: z.enum(['Approved', 'Rejected']).describe('The decision on the claim.'),
  summary: z.string().describe('A concise summary of the claim and settlement comparison.'),
});
export type GenerateClaimSummaryOutput = z.infer<typeof GenerateClaimSummaryOutputSchema>;

export async function generateClaimSummary(input: GenerateClaimSummaryInput): Promise<GenerateClaimSummaryOutput> {
  return generateClaimSummaryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateClaimSummaryPrompt',
  input: {schema: GenerateClaimSummaryInputSchema},
  output: {schema: GenerateClaimSummaryOutputSchema},
  prompt: `Based on the claim amount of {{{claimAmount}}}, the settlement amount of {{{settlementAmount}}}, and the eligibility status of {{{isEligible}}} with the reason {{{reason}}}, generate a decision (Approved or Rejected) and a concise summary of the claim and settlement comparison.

Ensure the decision aligns with the eligibility status and the summary provides a clear understanding of the outcome.

Output MUST be JSON. Only include the "decision" and "summary" fields in the JSON. The summary should not be more than 2 sentences.
`,
});

const generateClaimSummaryFlow = ai.defineFlow(
  {
    name: 'generateClaimSummaryFlow',
    inputSchema: GenerateClaimSummaryInputSchema,
    outputSchema: GenerateClaimSummaryOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
