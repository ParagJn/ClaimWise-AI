
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

// This remains the schema for the FLOW's output and the EXPORTED FUNCTION's output.
const ExtractAndFillClaimDataOutputSchema = z.record(z.any()).describe('The auto-filled claim data in JSON format.');
export type ExtractAndFillClaimDataOutput = z.infer<typeof ExtractAndFillClaimDataOutputSchema>;

export async function extractAndFillClaimData(input: ExtractAndFillClaimDataInput): Promise<ExtractAndFillClaimDataOutput> {
  return extractAndFillClaimDataFlow(input);
}

// Define a schema for the raw JSON string output from the prompt itself, allowing it to be null.
const ClaimDataJsonStringSchema = z.string().nullable().describe('A JSON string representing the auto-filled claim data, or null.');

const prompt = ai.definePrompt({
  name: 'extractAndFillClaimDataPrompt',
  input: {schema: ExtractAndFillClaimDataInputSchema},
  // The prompt will directly output a JSON string or null.
  output: {schema: ClaimDataJsonStringSchema},
  prompt: `You are an AI assistant specialized in extracting information from claim documents and auto-filling claim forms.

  Instructions:
  1. Analyze the provided claim document image.
  2. Extract all relevant information from the document using OCR and other AI techniques.
  3. Compare the extracted information with the current claim data.
  4. Fill in any missing values in the current claim data with the extracted information.
  5. If there are conflicting values, use the information extracted from the claim document.
  6. Return the auto-filled claim data as a JSON string.

  Claim Document:
  {{media url=claimDocumentDataUri}}

  Current Claim Data:
  {{json currentClaimData}}

  Output:
  Return the auto-filled claim data as a JSON string. Ensure the string is valid JSON.
  If no data can be extracted or there is an issue, return an empty JSON object as a string (e.g., "{}"). DO NOT RETURN NULL if possible, prefer an empty JSON string.
  `,
});

const extractAndFillClaimDataFlow = ai.defineFlow(
  {
    name: 'extractAndFillClaimDataFlow',
    inputSchema: ExtractAndFillClaimDataInputSchema,
    // The flow's final output schema is the parsed object.
    outputSchema: ExtractAndFillClaimDataOutputSchema,
  },
  async (input): Promise<ExtractAndFillClaimDataOutput> => {
    let {output: jsonStringOutput} = await prompt(input);

    // Ensure jsonStringOutput is a string before parsing. If it's null or undefined, default to an empty JSON string.
    if (jsonStringOutput === undefined || jsonStringOutput === null) {
        console.warn('AI returned null or undefined for claim data extraction. Defaulting to empty JSON object string.');
        jsonStringOutput = '{}';
    }

    try {
      const parsedData: ExtractAndFillClaimDataOutput = JSON.parse(jsonStringOutput);
      return parsedData;
    } catch (error) {
      console.error('Failed to parse JSON output from AI for claim data:', error, 'Raw output was:', jsonStringOutput);
      // If parsing fails, return an empty object as a fallback, as per the original intent.
      // Or, re-throw a more specific error if preferred.
      return {};
    }
  }
);

