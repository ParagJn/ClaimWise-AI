'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import DashboardMetrics from '@/components/DashboardMetrics';
import ClaimStepCard from '@/components/ClaimStepCard';
import AdminPanel from '@/components/AdminPanel';
import ClaimDetailsView from '@/components/ClaimDetailsView';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, AlertTriangle, Info } from 'lucide-react';

import { extractAndFillClaimData, type ExtractAndFillClaimDataOutput } from '@/ai/flows/extract-and-fill-claim-data';
import { highlightClaimInconsistencies, type HighlightClaimInconsistenciesOutput } from '@/ai/flows/highlight-claim-inconsistencies';
import { generateClaimSummary, type GenerateClaimSummaryOutput } from '@/ai/flows/generate-claim-summary';
import { generateMissingInfoEmail, type GenerateMissingInfoEmailOutput } from '@/ai/flows/generate-missing-info-email';

const PLACEHOLDER_IMAGE_DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const GOOGLE_COLORS = {
  blue: 'border-google-blue',
  red: 'border-google-red',
  yellow: 'border-google-yellow',
  green: 'border-google-green',
  muted: 'border-muted-foreground'
};

type ClaimData = {
  claimId: string;
  policyNumber: string;
  claimantName: string;
  claimantAadhaar: string;
  dateOfService: string;
  hospitalName: string | null;
  diagnosis: string | null;
  claimedAmount: number;
  documents: Array<{ type: string; fileName: string }>;
  medicalCodes: string[];
  settlementAmount: number | null;
  missingInformation: string[];
  [key: string]: any; // Allow for additional fields from OCR
};

type MemberData = {
  members: Array<{
    aadhaarNumber: string;
    name: string;
    policyNumber: string;
    policyStatus: 'Active' | 'Inactive';
    premiumPaidDate: string;
  }>;
};

type MedicalCodesData = {
  eligibleCodes: string[];
  ineligibleCodes: string[];
  rules: string[];
};

const initialDashboardMetrics = {
  totalClaims: 0,
  processingClaims: 0,
  validatedClaims: 0,
  rejectedClaims: 0,
};

export default function Home() {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0); // 0: Idle, 1-7: Steps
  const [claimData, setClaimData] = useState<ClaimData | null>(null);
  const [initialClaimData, setInitialClaimData] = useState<ClaimData | null>(null);
  const [memberData, setMemberData] = useState<MemberData | null>(null);
  const [medicalCodes, setMedicalCodes] = useState<MedicalCodesData | null>(null);

  const [ocrOutput, setOcrOutput] = useState<ExtractAndFillClaimDataOutput | null>(null);
  const [inconsistencies, setInconsistencies] = useState<HighlightClaimInconsistenciesOutput | null>(null);
  const [eligibilityCheckResult, setEligibilityCheckResult] = useState<{ status: string; message: string } | null>(null);
  const [medicalVerificationResult, setMedicalVerificationResult] = useState<{ status: string; message: string, isEligible: boolean } | null>(null);
  const [decisionSummary, setDecisionSummary] = useState<GenerateClaimSummaryOutput | null>(null);
  const [missingInfoEmail, setMissingInfoEmail] = useState<GenerateMissingInfoEmailOutput | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [currentStepStatus, setCurrentStepStatus] = useState<'pending' | 'in-progress' | 'completed' | 'error' | 'info'>('pending');
  const [aiStepSummary, setAiStepSummary] = useState<React.ReactNode>('');

  const [dashboardMetrics, setDashboardMetrics] = useState(initialDashboardMetrics);

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [claimRes, memberRes, medicalRes] = await Promise.all([
        fetch('/data/claim.json'),
        fetch('/data/member_data.json'),
        fetch('/data/medical_codes.json'),
      ]);
      if (!claimRes.ok || !memberRes.ok || !medicalRes.ok) throw new Error("Failed to load initial data.");
      
      const claimJson: ClaimData = await claimRes.json();
      setClaimData(claimJson);
      setInitialClaimData(claimJson); // Save a copy for reset
      setMemberData(await memberRes.json());
      setMedicalCodes(await medicalRes.json());
      setDashboardMetrics(prev => ({ ...prev, totalClaims: 1 }));
      setCurrentStep(0); // Ready to start
      resetFlowStates();
    } catch (error) {
      console.error("Error loading data:", error);
      toast({ title: "Error", description: "Failed to load initial data. Please try reloading.", variant: "destructive" });
      setCurrentStepStatus('error');
      setAiStepSummary('Failed to load critical data. Please check console and reload.');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const resetFlowStates = () => {
    setOcrOutput(null);
    setInconsistencies(null);
    setEligibilityCheckResult(null);
    setMedicalVerificationResult(null);
    setDecisionSummary(null);
    setMissingInfoEmail(null);
    setCurrentStepStatus('pending');
    setAiStepSummary('');
    if (initialClaimData) setClaimData(initialClaimData); // Reset claimData to initial
    setDashboardMetrics(prev => ({ ...initialDashboardMetrics, totalClaims: prev.totalClaims }));
  };

  const handleReset = () => {
    setCurrentStep(0);
    resetFlowStates();
    if (initialClaimData) setClaimData(initialClaimData);
    setDashboardMetrics(prev => ({...initialDashboardMetrics, totalClaims: 1}));
    toast({ title: "Process Reset", description: "Claim process has been reset to the beginning." });
  };

  const proceedToNextStep = () => {
    if (currentStep < 7) { // Max 7 steps including missing info
      setCurrentStep(prev => prev + 1);
      setCurrentStepStatus('pending');
      setAiStepSummary('Preparing for the next step...');
    }
  };

  const handleProcessStep = useCallback(async () => {
    if (!claimData || !memberData || !medicalCodes) {
      toast({ title: "Data Missing", description: "Core data not loaded. Cannot process.", variant: "destructive" });
      return;
    }
    
    setIsLoading(true);
    setCurrentStepStatus('in-progress');
    setDashboardMetrics(prev => ({ ...prev, processingClaims: 1, validatedClaims: 0, rejectedClaims: 0 }));
    
    try {
      switch (currentStep) {
        case 1: // Claim Submission (already done by loading)
          setAiStepSummary("Claim data and documents received and registered.");
          setCurrentStepStatus('completed');
          break;

        case 2: // Eligibility Check
          setAiStepSummary("Performing initial eligibility checks...");
          const member = memberData.members.find(m => m.aadhaarNumber === claimData.claimantAadhaar && m.policyNumber === claimData.policyNumber);
          if (member && member.policyStatus === 'Active') {
            setEligibilityCheckResult({ status: 'Eligible', message: `Policy ${member.policyNumber} is Active for ${member.name}. Premium paid on ${member.premiumPaidDate}.` });
            setAiStepSummary(`Policy holder ${member.name} is eligible. Policy status: Active.`);
            setCurrentStepStatus('completed');
          } else {
            setEligibilityCheckResult({ status: 'Ineligible', message: `Policy/Member not found or policy is Inactive.` });
            setAiStepSummary('Claimant is ineligible based on policy status or member data.');
            setCurrentStepStatus('error'); // Or 'info' if it can proceed to missing info
            setDashboardMetrics(prev => ({ ...prev, processingClaims: 0, rejectedClaims: 1 }));
            // Potentially end flow or go to missing info
          }
          break;

        case 3: // OCR + GenAI
          setAiStepSummary("Extracting data from documents using AI (simulated OCR)...");
          const ocrResult = await extractAndFillClaimData({
            claimDocumentDataUri: PLACEHOLDER_IMAGE_DATA_URI,
            currentClaimData: claimData,
          });
          setOcrOutput(ocrResult);
          setClaimData(prev => ({ ...prev!, ...ocrResult })); // Update claimData with OCR results
          setAiStepSummary(`AI has extracted and auto-filled data. ${Object.keys(ocrResult).length - Object.keys(claimData).length} new fields populated. Review extracted data below.`);
          setCurrentStepStatus('completed');
          break;

        case 4: // Consistency Check
          setAiStepSummary("Running AI consistency checks on claim data against rules...");
          const consistencyResult = await highlightClaimInconsistencies({
            claimData: JSON.stringify(claimData),
            rules: JSON.stringify(medicalCodes.rules.concat(medicalCodes.eligibleCodes.map(c => `Eligible code: ${c}`)).concat(medicalCodes.ineligibleCodes.map(c => `Ineligible code: ${c}`))),
          });
          setInconsistencies(consistencyResult);
          if (consistencyResult.inconsistencies.length > 0) {
            setAiStepSummary(<>Found {consistencyResult.inconsistencies.length} potential inconsistencies. Summary: {consistencyResult.summary} Review details below.</>);
            // Check if this warrants going to missing info path
            if (consistencyResult.inconsistencies.some(inc => inc.toLowerCase().includes("critical") || inc.toLowerCase().includes("missing document"))) {
              setClaimData(prev => ({...prev!, missingInformation: consistencyResult.inconsistencies}));
              setCurrentStep(7); // Jump to Missing Info step
              return; // Skip setIsLoading(false) for this path
            }
          } else {
            setAiStepSummary("AI consistency check passed. No major inconsistencies found.");
          }
          setCurrentStepStatus('completed');
          break;

        case 5: // Eligibility Verification (Medical Codes)
          setAiStepSummary("Verifying medical eligibility based on codes...");
          // Simulate medical code validation
          let isEligible = false;
          let verificationMessage = "No eligible medical codes found or codes conflict with policy rules.";
          if (claimData.medicalCodes && claimData.medicalCodes.length > 0) {
            isEligible = claimData.medicalCodes.some(code => medicalCodes.eligibleCodes.includes(code)) &&
                         !claimData.medicalCodes.some(code => medicalCodes.ineligibleCodes.includes(code));
            if(isEligible) {
              verificationMessage = `Medical codes ${claimData.medicalCodes.join(', ')} verified. Claim appears medically eligible.`;
            } else {
              verificationMessage = `Medical codes ${claimData.medicalCodes.join(', ')} include ineligible codes or miss eligible ones.`;
            }
          } else if (ocrOutput && ocrOutput.medicalCodes && (ocrOutput.medicalCodes as string[]).length > 0) {
             // Try using codes from OCR if not directly in claimData
            const ocrMedCodes = ocrOutput.medicalCodes as string[];
             isEligible = ocrMedCodes.some(code => medicalCodes.eligibleCodes.includes(code)) &&
                         !ocrMedCodes.some(code => medicalCodes.ineligibleCodes.includes(code));
            if(isEligible) {
              verificationMessage = `Medical codes ${ocrMedCodes.join(', ')} (from OCR) verified. Claim appears medically eligible.`;
            } else {
              verificationMessage = `Medical codes ${ocrMedCodes.join(', ')} (from OCR) include ineligible codes or miss eligible ones.`;
            }
          }

          setMedicalVerificationResult({ status: isEligible ? 'Eligible' : 'Ineligible', message: verificationMessage, isEligible });
          setAiStepSummary(verificationMessage);
          setCurrentStepStatus(isEligible ? 'completed' : 'error');
          if (!isEligible) {
            setDashboardMetrics(prev => ({ ...prev, processingClaims: 0, rejectedClaims: 1 }));
          }
          break;

        case 6: // Summary & Decision
          if (!medicalVerificationResult) { // Ensure previous step ran
             setAiStepSummary("Medical verification must be completed first.");
             setCurrentStepStatus('error');
             break;
          }
          setAiStepSummary("Generating final decision summary with AI...");
          // Simulate settlement amount or derive it
          const settlementAmount = medicalVerificationResult.isEligible ? claimData.claimedAmount * 0.9 : 0; // Example: 90% if eligible
          setClaimData(prev => ({ ...prev!, settlementAmount }));

          const summaryResult = await generateClaimSummary({
            claimAmount: claimData.claimedAmount,
            settlementAmount: settlementAmount,
            isEligible: medicalVerificationResult.isEligible && (eligibilityCheckResult?.status === 'Eligible'),
            reason: medicalVerificationResult.message + " | " + (eligibilityCheckResult?.message || ""),
          });
          setDecisionSummary(summaryResult);
          setAiStepSummary(<>Decision: <strong>{summaryResult.decision}</strong>. {summaryResult.summary}</>);
          setCurrentStepStatus('completed');
          if (summaryResult.decision === 'Approved') {
            setDashboardMetrics(prev => ({ ...prev, processingClaims: 0, validatedClaims: 1 }));
          } else {
            setDashboardMetrics(prev => ({ ...prev, processingClaims: 0, rejectedClaims: 1 }));
          }
          break;

        case 7: // Missing Info Path
          setAiStepSummary("AI is generating an email for missing information...");
           const missingInfoForEmail = claimData.missingInformation?.length > 0 ? claimData.missingInformation : ["Details about diagnosis", "Copy of ID proof"];

          const emailResult = await generateMissingInfoEmail({
            claimId: claimData.claimId,
            claimantName: claimData.claimantName,
            missingInformation: missingInfoForEmail,
          });
          setMissingInfoEmail(emailResult);
          setAiStepSummary("AI generated a draft email to request missing information. See details below.");
          setCurrentStepStatus('info');
          setDashboardMetrics(prev => ({ ...prev, processingClaims: 0 })); // No longer processing actively
          break;
        
        default:
          setAiStepSummary("Unknown step or process not started.");
          setCurrentStepStatus('pending');
      }
    } catch (error: any) {
      console.error(`Error in step ${currentStep}:`, error);
      toast({ title: `Error in Step ${currentStep}`, description: error.message || "An unexpected error occurred.", variant: "destructive" });
      setCurrentStepStatus('error');
      setAiStepSummary(`An error occurred: ${error.message}. Check console for details.`);
      setDashboardMetrics(prev => ({ ...prev, processingClaims: 0 }));
    } finally {
      // Only set loading to false if not jumped to step 7
      if (currentStep !== 4 || (currentStep === 4 && claimData?.missingInformation?.length === 0)) {
         setIsLoading(false);
      }
    }
  }, [currentStep, claimData, memberData, medicalCodes, toast, ocrOutput, eligibilityCheckResult, medicalVerificationResult]);

  const renderStepContent = () => {
    if (isLoading && currentStep === 0) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /> <p className="ml-4 text-lg">Loading Initial Data...</p></div>;
    if (!claimData || !memberData || !medicalCodes) return <p className="text-center text-lg text-muted-foreground p-8">Initializing application data. Please wait or reload if this persists.</p>;

    const commonActionButton = (text: string = "Process This Step") => ({
      text: text,
      onClick: handleProcessStep,
      disabled: isLoading || currentStepStatus === 'completed' || currentStepStatus === 'error' && currentStep !== 7, // Allow processing for missing info
      loading: isLoading && currentStepStatus === 'in-progress',
    });
    
    const nextStepButton = (text: string = "Proceed to Next Step") => ({
        text: text,
        onClick: proceedToNextStep,
        disabled: isLoading || currentStepStatus !== 'completed',
    });

    switch (currentStep) {
      case 0: // Idle / Start
        return (
          <Card className="shadow-xl text-center p-8">
            <CardHeader>
              <CardTitle className="text-3xl font-headline">Welcome to ClaimWise AI</CardTitle>
              <CardDescription>AI-Powered Claims Validation System Prototype</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-6">Click the button below to start processing a sample claim.</p>
              <Button size="lg" onClick={proceedToNextStep} disabled={isLoading}>
                Start Claim Processing
              </Button>
            </CardContent>
          </Card>
        );
      case 1: // Claim Submission
        return (
          <ClaimStepCard
            stepNumber={1} title="Claim Submission" status={currentStepStatus}
            aiSummary={aiStepSummary} borderColorClass={GOOGLE_COLORS.blue}
            actionButton={currentStepStatus === 'completed' ? nextStepButton() : commonActionButton()}
          >
            <ClaimDetailsView data={claimData} title="Initial Claim Data" />
          </ClaimStepCard>
        );
      case 2: // Eligibility Check
        return (
          <ClaimStepCard
            stepNumber={2} title="Policy & Member Eligibility Check" status={currentStepStatus}
            aiSummary={aiStepSummary} borderColorClass={GOOGLE_COLORS.yellow}
            actionButton={currentStepStatus === 'completed' ? nextStepButton() : (eligibilityCheckResult?.status === 'Ineligible' ? {text: "Process Blocked", onClick:()=>{}, disabled:true} : commonActionButton())}
          >
            {eligibilityCheckResult && (
              <p className={`font-semibold ${eligibilityCheckResult.status === 'Eligible' ? 'text-google-green' : 'text-google-red'}`}>
                {eligibilityCheckResult.status}: {eligibilityCheckResult.message}
              </p>
            )}
            <ClaimDetailsView data={{ claimantAadhaar: claimData.claimantAadhaar, policyNumber: claimData.policyNumber }} title="Data Used for Check" />
          </ClaimStepCard>
        );
      case 3: // OCR + GenAI
        return (
          <ClaimStepCard
            stepNumber={3} title="Document Data Extraction (OCR + GenAI)" status={currentStepStatus}
            aiSummary={aiStepSummary} borderColorClass={GOOGLE_COLORS.green}
            actionButton={currentStepStatus === 'completed' ? nextStepButton() : commonActionButton()}
          >
            {ocrOutput && <ClaimDetailsView data={ocrOutput} title="AI Extracted/Filled Data" />}
            <p className="text-xs text-muted-foreground mt-2">Simulated document: placeholder 1x1 pixel image.</p>
          </ClaimStepCard>
        );
      case 4: // Consistency Check
        return (
          <ClaimStepCard
            stepNumber={4} title="Claim Consistency Check (RAG + GenAI)" status={currentStepStatus}
            aiSummary={aiStepSummary} borderColorClass={GOOGLE_COLORS.red}
            actionButton={currentStepStatus === 'completed' ? nextStepButton() : commonActionButton()}
          >
            {inconsistencies && (
              <>
                <ClaimDetailsView data={{inconsistencies: inconsistencies.inconsistencies}} title="Detected Inconsistencies" />
                <p className="text-sm mt-2"><strong>AI Summary of Inconsistencies:</strong> {inconsistencies.summary}</p>
              </>
            )}
          </ClaimStepCard>
        );
      case 5: // Eligibility Verification
        return (
          <ClaimStepCard
            stepNumber={5} title="Medical Eligibility Verification" status={currentStepStatus}
            aiSummary={aiStepSummary} borderColorClass={GOOGLE_COLORS.blue}
            actionButton={currentStepStatus === 'completed' ? nextStepButton() : (medicalVerificationResult?.status === 'Ineligible' ? {text: "Process Blocked", onClick:()=>{}, disabled:true} : commonActionButton())}
          >
            {medicalVerificationResult && (
              <p className={`font-semibold ${medicalVerificationResult.isEligible ? 'text-google-green' : 'text-google-red'}`}>
                Status: {medicalVerificationResult.status} - {medicalVerificationResult.message}
              </p>
            )}
             <ClaimDetailsView data={{ medicalCodesUsed: claimData.medicalCodes, rulesSnapshot: medicalCodes.eligibleCodes.slice(0,2).concat(medicalCodes.ineligibleCodes.slice(0,1)) }} title="Data Used for Verification" />
          </ClaimStepCard>
        );
      case 6: // Summary & Decision
        return (
          <ClaimStepCard
            stepNumber={6} title="Final Summary & Decision" status={currentStepStatus}
            aiSummary={aiStepSummary}
            borderColorClass={decisionSummary?.decision === 'Approved' ? GOOGLE_COLORS.green : (decisionSummary?.decision === 'Rejected' ? GOOGLE_COLORS.red : GOOGLE_COLORS.muted)}
            actionButton={currentStepStatus === 'completed' ? { text: "Process Complete. Reset to Start.", onClick: handleReset } : commonActionButton()}
          >
            {decisionSummary && (
              <>
                <p className={`text-2xl font-bold ${decisionSummary.decision === 'Approved' ? 'text-google-green' : 'text-google-red'}`}>
                  {decisionSummary.decision.toUpperCase()}
                </p>
                <p className="mt-2"><strong>AI Generated Summary:</strong> {decisionSummary.summary}</p>
                <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                    <div><strong>Claimed Amount:</strong> {claimData.claimedAmount.toLocaleString()}</div>
                    <div><strong>Settlement Amount:</strong> {(claimData.settlementAmount ?? 0).toLocaleString()}</div>
                </div>
              </>
            )}
          </ClaimStepCard>
        );
       case 7: // Missing Info Path
        return (
          <ClaimStepCard
            stepNumber={7} title="Missing Information Required" status={currentStepStatus}
            aiSummary={aiStepSummary} borderColorClass={GOOGLE_COLORS.yellow}
             actionButton={{
                text: "Simulate Info Provided & Retry Consistency Check",
                onClick: () => {
                    // Simulate providing info, e.g. clearing missingInformation array
                    // and maybe adding some placeholder to diagnosis if it was missing.
                    setClaimData(prev => ({ ...prev!, missingInformation: [], diagnosis: prev?.diagnosis || "Updated Diagnosis" }));
                    setCurrentStep(4); // Go back to consistency check
                    setCurrentStepStatus('pending');
                    setAiStepSummary('Simulated information provided. Retrying consistency check...');
                    setIsLoading(false); // Ensure loading is false before triggering new step processing
                },
                disabled: isLoading,
                loading: isLoading && currentStepStatus === 'in-progress',
            }}
          >
            {missingInfoEmail && (
              <div className="space-y-2">
                <h5 className="font-semibold">AI Generated Email Draft:</h5>
                <p><strong>Subject:</strong> {missingInfoEmail.emailSubject}</p>
                <ScrollArea className="h-40 rounded-md border p-2 bg-background">
                  <pre className="text-xs whitespace-pre-wrap">{missingInfoEmail.emailBody}</pre>
                </ScrollArea>
              </div>
            )}
             <ClaimDetailsView data={{missingItems: claimData.missingInformation}} title="Items Marked as Missing" />
          </ClaimStepCard>
        );
      default:
        return <p>Invalid step.</p>;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8">
        <DashboardMetrics {...dashboardMetrics} />
        {renderStepContent()}
        <AdminPanel onReset={handleReset} />
      </main>
      <footer className="text-center py-4 text-sm text-muted-foreground border-t">
        ClaimWise AI &copy; {new Date().getFullYear()} - Powered by Firebase Studio & Genkit
      </footer>
    </div>
  );
}
