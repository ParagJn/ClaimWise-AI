'use server';
/**
 * @fileOverview Highlights inconsistencies in claim data using RAG and GenAI.
 *
 * - highlightClaimInconsistencies - A function that identifies inconsistencies between claim data and existing rules/data sources.
 * - HighlightClaimInconsistenciesInput - The input type for the highlightClaimInconsistencies function.
 * - HighlightClaimInconsistenciesOutput - The return type for the highlightClaimInconsistencies function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const HighlightClaimInconsistenciesInputSchema = z.object({
  claimData: z.string().describe('JSON string of the claim data.'),
  rules: z.string().describe('JSON string of the existing rules and data sources.'),
});
export type HighlightClaimInconsistenciesInput = z.infer<typeof HighlightClaimInconsistenciesInputSchema>;

const HighlightClaimInconsistenciesOutputSchema = z.object({
  inconsistencies: z.array(z.string()).describe('Array of inconsistencies found in the claim data.'),
  summary: z.string().describe('A summary of the inconsistencies and their potential impact.'),
});
export type HighlightClaimInconsistenciesOutput = z.infer<typeof HighlightClaimInconsistenciesOutputSchema>;

export async function highlightClaimInconsistencies(
  input: HighlightClaimInconsistenciesInput
): Promise<HighlightClaimInconsistenciesOutput> {
  return highlightClaimInconsistenciesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'highlightClaimInconsistenciesPrompt',
  input: {schema: HighlightClaimInconsistenciesInputSchema},
  output: {schema: HighlightClaimInconsistenciesOutputSchema},
  prompt: `You are an AI agent specializing in identifying inconsistencies in claim data.

You are provided with claim data and a set of rules and data sources. Your task is to identify any inconsistencies between the claim data and the rules/data sources.

Claim Data: {{{claimData}}}
Rules and Data Sources: {{{rules}}}

Identify any inconsistencies and provide a summary of their potential impact.

Output should be a JSON object conforming to the following schema:\n${JSON.stringify(HighlightClaimInconsistenciesOutputSchema.describe, null, 2)}`,
});

const highlightClaimInconsistenciesFlow = ai.defineFlow(
  {
    name: 'highlightClaimInconsistenciesFlow',
    inputSchema: HighlightClaimInconsistenciesInputSchema,
    outputSchema: HighlightClaimInconsistenciesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
