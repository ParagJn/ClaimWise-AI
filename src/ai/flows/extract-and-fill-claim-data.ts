
'use server';
/**
 * @fileOverview This file defines a Genkit flow for simulating the extraction of data from claim documents using GenAI
 * and auto-filling/augmenting the corresponding fields in the claim form.
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
      "A claim document image (placeholder for simulation), as a data URI. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  currentClaimData: z.record(z.any()).describe('The current claim data in JSON format.'),
});
export type ExtractAndFillClaimDataInput = z.infer<typeof ExtractAndFillClaimDataInputSchema>;

const ExtractAndFillClaimDataOutputSchema = z.record(z.any()).describe('The auto-filled and augmented claim data in JSON format.');
export type ExtractAndFillClaimDataOutput = z.infer<typeof ExtractAndFillClaimDataOutputSchema>;

// Define a schema for the raw JSON string output from the prompt itself, allowing it to be null.
const ClaimDataJsonStringSchema = z.string().nullable().describe('A JSON string representing the auto-filled claim data, or null.');

export async function extractAndFillClaimData(input: ExtractAndFillClaimDataInput): Promise<ExtractAndFillClaimDataOutput> {
  return extractAndFillClaimDataFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractAndFillClaimDataPrompt',
  input: {schema: ExtractAndFillClaimDataInputSchema},
  output: {schema: ClaimDataJsonStringSchema}, // The prompt will directly output a JSON string or null.
  prompt: `You are an AI assistant that simulates the OCR (Optical Character Recognition) process for medical claim documents and auto-fills/augments claim forms.

**Task:**
Based on the provided \`currentClaimData\`, simulate the extraction of additional information that would typically be found on a detailed claim document or supporting medical reports.
The \`claimDocumentDataUri\` provided is a placeholder and should NOT be analyzed. Your task is to generate plausible new data or refine existing data.

**Instructions for Data Simulation:**
1.  Take the \`currentClaimData\` as the base.
2.  **Add 2 to 3 NEW fields** that are commonly found in medical claim documentation but might not be in the initial submission.
    Examples of new fields:
    *   \`hospitalAddress\`: (string) e.g., "123 Health St, Wellness City, MedState 12345"
    *   \`attendingPhysician\`: (string) e.g., "Dr. Emily Carter"
    *   \`dateOfAdmission\`: (string, YYYY-MM-DD format) e.g., "2023-10-20" (should be consistent with \`dateOfService\`)
    *   \`dateOfDischarge\`: (string, YYYY-MM-DD format) e.g., "2023-10-25" (should be after \`dateOfAdmission\`)
    *   \`roomType\`: (string) e.g., "Private" or "Semi-Private"
    *   \`referringDoctor\`: (string) e.g., "Dr. John Doe"
3.  **Optionally, modify 1 existing field** from \`currentClaimData\` to be more specific or detailed, as if this more detailed information was found on the document.
    For example, if \`diagnosis\` is general (e.g., "Fever"), make it more specific (e.g., "Viral Fever with Dehydration"). If \`hospitalName\` is null or empty, you can fill it with a plausible name. If \`medicalCodes\` is empty, you could add a plausible one like "ICD-10: J06.9".
4.  Ensure all simulated data is plausible and consistent with a typical medical claim scenario. For example, \`dateOfDischarge\` should be on or after \`dateOfAdmission\`, and both should relate to \`dateOfService\`.
5.  **Output Format:** Return the *complete, updated claim data* (including all original fields from \`currentClaimData\` plus your newly added/modified fields) as a single, valid JSON string.

**Inputs:**
Claim Document (Placeholder - DO NOT ANALYZE):
{{media url=claimDocumentDataUri}}

Current Claim Data:
{{json currentClaimData}}

**Simulated OCR Output (JSON String):**
Return the entire updated claim data as a JSON string.
Example of expected output structure if \`currentClaimData\` was \`{"claimId": "C1", "claimedAmount": 100}\` and you added \`hospitalAddress\` and \`attendingPhysician\`:
\`"{\\"claimId\\": \\"C1\\", \\"claimedAmount\\": 100, \\"hospitalAddress\\": \\"123 Health St\\", \\"attendingPhysician\\": \\"Dr. Smith\\"}"\`
Ensure the output is ONLY the JSON string.
If, for any reason, you cannot generate meaningful new data, you can return the original \`currentClaimData\` as a JSON string, but try to add or modify fields if possible. Do not return null.
  `,
});

const extractAndFillClaimDataFlow = ai.defineFlow(
  {
    name: 'extractAndFillClaimDataFlow',
    inputSchema: ExtractAndFillClaimDataInputSchema,
    outputSchema: ExtractAndFillClaimDataOutputSchema, // The flow's final output schema is the parsed object.
  },
  async (input): Promise<ExtractAndFillClaimDataOutput> => {
    let {output: jsonStringOutput} = await prompt(input);

    // Ensure jsonStringOutput is a string before parsing. If it's null or undefined, default to an empty JSON string.
    if (jsonStringOutput === undefined || jsonStringOutput === null) {
        console.warn('AI returned null or undefined for claim data extraction. Defaulting to currentClaimData as JSON string.');
        // Fallback to returning the original data if AI fails to produce a string
        try {
            return JSON.parse(JSON.stringify(input.currentClaimData)); // Return a copy
        } catch (e) {
            console.error('Failed to stringify/parse currentClaimData as fallback:', e);
            return {}; // Ultimate fallback
        }
    }

    try {
      const parsedData: ExtractAndFillClaimDataOutput = JSON.parse(jsonStringOutput);
      return parsedData;
    } catch (error) {
      console.error('Failed to parse JSON output from AI for claim data:', error, 'Raw output was:', jsonStringOutput);
      // If parsing fails, attempt to return the original input data if it's safer
       try {
            return JSON.parse(JSON.stringify(input.currentClaimData)); // Return a copy
        } catch (e) {
            console.error('Failed to stringify/parse currentClaimData as fallback after parsing error:', e);
            return {}; // Ultimate fallback
        }
    }
  }
);
