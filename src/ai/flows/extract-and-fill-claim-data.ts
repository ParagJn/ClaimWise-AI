
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

// Define a schema for the raw JSON string output from the prompt itself.
const ClaimDataJsonStringSchema = z.string().describe('A JSON string representing the auto-filled claim data.');

const prompt = ai.definePrompt({
  name: 'extractAndFillClaimDataPrompt',
  input: {schema: ExtractAndFillClaimDataInputSchema},
  // The prompt will directly output a JSON string.
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
    const {output: jsonStringOutput} = await prompt(input);

    if (jsonStringOutput === undefined || jsonStringOutput === null) {
        console.error('AI returned no output (null or undefined) for claim data extraction.');
        throw new Error('AI returned no output for claim data extraction. Expected a JSON string.');
    }

    try {
      const parsedData: ExtractAndFillClaimDataOutput = JSON.parse(jsonStringOutput);
      return parsedData;
    } catch (error) {
      console.error('Failed to parse JSON output from AI for claim data:', error, 'Raw output was:', jsonStringOutput);
      throw new Error('AI returned malformed JSON for extracted data. Raw output: ' + jsonStringOutput);
    }
  }
);

