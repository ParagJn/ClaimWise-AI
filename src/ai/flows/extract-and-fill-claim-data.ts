'use server';
/**
 * @fileOverview This file defines a Genkit flow for extracting data from claim documents using OCR and GenAI,
 * and auto-filling the corresponding fields in the claim form.
 *
 * - extractAndFillClaimData - A function that handles the data extraction and auto-filling process.
 * - ExtractAndFillClaimDataInput - The input type for the extractAndFillClaimData function.
 * - ExtractAndFillClaimDataOutput - The return type for the extractAndFillClaimData function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractAndFillClaimDataInputSchema = z.object({
  claimDocumentDataUri: z
    .string()
    .describe(
      "A claim document image, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  currentClaimData: z.record(z.any()).describe('The current claim data in JSON format.'),
});
export type ExtractAndFillClaimDataInput = z.infer<typeof ExtractAndFillClaimDataInputSchema>;

const ExtractAndFillClaimDataOutputSchema = z.record(z.any()).describe('The auto-filled claim data in JSON format.');
export type ExtractAndFillClaimDataOutput = z.infer<typeof ExtractAndFillClaimDataOutputSchema>;

export async function extractAndFillClaimData(input: ExtractAndFillClaimDataInput): Promise<ExtractAndFillClaimDataOutput> {
  return extractAndFillClaimDataFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractAndFillClaimDataPrompt',
  input: {schema: ExtractAndFillClaimDataInputSchema},
  output: {schema: ExtractAndFillClaimDataOutputSchema},
  prompt: `You are an AI assistant specialized in extracting information from claim documents and auto-filling claim forms.

  Instructions:
  1. Analyze the provided claim document image.
  2. Extract all relevant information from the document using OCR and other AI techniques.
  3. Compare the extracted information with the current claim data.
  4. Fill in any missing values in the current claim data with the extracted information.
  5. If there are conflicting values, use the information extracted from the claim document.
  6. Return the auto-filled claim data in JSON format.

  Claim Document:
  {{media url=claimDocumentDataUri}}

  Current Claim Data:
  {{json currentClaimData}}

  Output:
  Return the auto-filled claim data in JSON format.
  `,
});

const extractAndFillClaimDataFlow = ai.defineFlow(
  {
    name: 'extractAndFillClaimDataFlow',
    inputSchema: ExtractAndFillClaimDataInputSchema,
    outputSchema: ExtractAndFillClaimDataOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
