# **App Name**: ClaimWise AI

## Core Features:

- Claims Dashboard: Multi-step Claims Dashboard showing each step (Submission, Eligibility, OCR, Verification, Summary) as a card.
- Claim Details View: Display claim details, documents, and extracted data at each step.
- Simulated Data Validation: Simulate data validation checks using dummy JSON data for member records, premiums, and medical codes.
- AI-Powered Data Extraction: Simulate OCR extraction of claim document data. The AI tool decides how to use the data to auto-fill claim information, then presents result to the user.
- AI Consistency Check: Use simulated RAG to validate claim against existing rules and data. An AI tool should decide when or whether information in the rules contradict the data from the claims documents. Show inconsistency highlights to the user.
- AI-Driven Decision Summary: Generate a summary decision (Approved/Rejected) and a comparison of Claim vs. Settlement, presented in a clear format. Generate a mock "email summary" if info is missing.
- Admin Panel: Implement mock 'Admin Panel' to reset/reload claim processing states, useful for debugging.

## Style Guidelines:

- Background color: Off-white (#FAFAFA) for a clean, modern look.
- Primary color: Google Blue (#4285F4) for main actions and headers, providing a sense of trust and reliability.
- Accent color: Google Green (#34A853) for positive affirmations and successful validations.
- Use Google's brand colors (red, blue, yellow, green) for border styling of UI boxes/cards, indicating different claim stages or data sources. (Google Red: #EA4335, Google Yellow: #FBBC05)
- Body font: 'PT Sans', a humanist sans-serif, provides a modern and accessible reading experience.
- Headline font: 'Space Grotesk' sans-serif for headlines, giving a techy, scientific look
- Use Material Design icons (from Google Fonts) throughout the UI for consistency.
- Follow a card-based UI structure, inspired by the Appeals Dashboard, to represent the claim validation steps.
- Incorporate subtle animations for state transitions, providing smooth user experience during claim processing.