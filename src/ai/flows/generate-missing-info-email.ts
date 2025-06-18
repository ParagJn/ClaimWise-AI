// src/ai/flows/generate-missing-info-email.ts
'use server';
/**
 * @fileOverview Generates a draft email summarizing the required additional information for a claim.
 *
 * - generateMissingInfoEmail - A function that generates the draft email.
 * - GenerateMissingInfoEmailInput - The input type for the generateMissingInfoEmail function.
 * - GenerateMissingInfoEmailOutput - The return type for the generateMissingInfoEmail function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateMissingInfoEmailInputSchema = z.object({
  claimId: z.string().describe('The ID of the claim.'),
  missingInformation: z.array(z.string()).describe('A list of missing information items.'),
  claimantName: z.string().describe('The name of the claimant.'),
});
export type GenerateMissingInfoEmailInput = z.infer<typeof GenerateMissingInfoEmailInputSchema>;

const GenerateMissingInfoEmailOutputSchema = z.object({
  emailSubject: z.string().describe('The subject of the generated email.'),
  emailBody: z.string().describe('The body of the generated email.'),
});
export type GenerateMissingInfoEmailOutput = z.infer<typeof GenerateMissingInfoEmailOutputSchema>;

export async function generateMissingInfoEmail(input: GenerateMissingInfoEmailInput): Promise<GenerateMissingInfoEmailOutput> {
  return generateMissingInfoEmailFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateMissingInfoEmailPrompt',
  input: {schema: GenerateMissingInfoEmailInputSchema},
  output: {schema: GenerateMissingInfoEmailOutputSchema},
  prompt: `You are an AI assistant that generates draft emails to request missing information from claimants.

  Given the following claim ID, claimant name, and list of missing information, generate an email subject and body that politely requests the claimant to provide the missing information.

  Claim ID: {{{claimId}}}
  Claimant Name: {{{claimantName}}}
  Missing Information:
  {{#each missingInformation}}- {{{this}}}\n{{/each}}

  The email should be professional and concise. The subject should clearly indicate that additional information is required for the claim.
  The body should list the missing information and politely ask the claimant to provide it. Include a closing thank you.

  Output the email subject and body as a JSON object.
  `,
});

const generateMissingInfoEmailFlow = ai.defineFlow(
  {
    name: 'generateMissingInfoEmailFlow',
    inputSchema: GenerateMissingInfoEmailInputSchema,
    outputSchema: GenerateMissingInfoEmailOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
