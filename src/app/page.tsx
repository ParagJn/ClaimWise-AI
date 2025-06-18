
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, AlertTriangle, Info, List } from 'lucide-react';

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

type AvailableClaimFile = {
  name: string;
  path: string;
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
  const [initialClaimData, setInitialClaimData] = useState<ClaimData | null>(null); // Stores the originally loaded claim for reset purposes
  const [memberData, setMemberData] = useState<MemberData | null>(null);
  const [medicalCodes, setMedicalCodes] = useState<MedicalCodesData | null>(null);
  const [availableClaims, setAvailableClaims] = useState<AvailableClaimFile[]>([]);
  const [isClaimSelectionModalOpen, setIsClaimSelectionModalOpen] = useState(false);
  const [selectedClaimFile, setSelectedClaimFile] = useState<AvailableClaimFile | null>(null);


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

  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideModalConfig, setOverrideModalConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const resetFlowStates = useCallback(() => {
    setOcrOutput(null);
    setInconsistencies(null);
    setEligibilityCheckResult(null);
    setMedicalVerificationResult(null);
    setDecisionSummary(null);
    setMissingInfoEmail(null);
    setCurrentStepStatus('pending');
    // Only reset processingClaims, keep validated and rejected counts for accumulation
    setDashboardMetrics(prev => ({ ...prev, processingClaims: 0 })); 
  }, []);
  
  const loadClaimSpecificData = useCallback(async (claimFilePath: string) => {
    setIsLoading(true);
    resetFlowStates(); 
    setCurrentStep(0); 
    try {
      const claimRes = await fetch(claimFilePath);
      if (!claimRes.ok) throw new Error(`Failed to load claim data from ${claimFilePath}.`);
      
      const claimJson: ClaimData = await claimRes.json();
      setClaimData(claimJson);
      setInitialClaimData(JSON.parse(JSON.stringify(claimJson))); 
      
      setCurrentStep(0); 
      setAiStepSummary(`Claim "${availableClaims.find(c => c.path === claimFilePath)?.name || 'Selected Claim'}" loaded. Click "Start Processing This Claim" to begin.`);

    } catch (error) {
      console.error("Error loading claim-specific data:", error);
      toast({ title: "Error", description: `Failed to load selected claim data. ${error instanceof Error ? error.message : ''}`, variant: "destructive" });
      setCurrentStepStatus('error');
      setAiStepSummary('Failed to load the selected claim. Please try another or check console.');
      setClaimData(null);
      setInitialClaimData(null);
    } finally {
      setIsLoading(false);
    }
  }, [toast, resetFlowStates, availableClaims]);


  const fetchCoreData = useCallback(async () => {
    if (memberData && medicalCodes && availableClaims.length > 0) return; 
    
    setIsLoading(true);
    try {
      const [memberRes, medicalRes, availableClaimsRes] = await Promise.all([
        fetch('/data/member_data.json'),
        fetch('/data/medical_codes.json'),
        fetch('/data/available_claims.json'),
      ]);
      if (!memberRes.ok || !medicalRes.ok || !availableClaimsRes.ok) throw new Error("Failed to load core application data.");
      
      const fetchedMemberData: MemberData = await memberRes.json();
      const fetchedMedicalCodes: MedicalCodesData = await medicalRes.json();
      const claimsList: AvailableClaimFile[] = await availableClaimsRes.json();
      
      setMemberData(fetchedMemberData);
      setMedicalCodes(fetchedMedicalCodes);
      setAvailableClaims(claimsList);
      setDashboardMetrics(prev => ({ ...prev, totalClaims: claimsList.length }));

      if (!fetchedMemberData || !Array.isArray(fetchedMemberData.members)) {
        console.error("Member data is not in the expected format:", fetchedMemberData);
        toast({ title: "Data Error", description: "Member data is not loaded correctly. Please check the console.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error loading core data:", error);
      toast({ title: "Error", description: "Failed to load core application data. Please try reloading.", variant: "destructive" });
      setCurrentStepStatus('error');
      setAiStepSummary('Failed to load critical data. Please check console and reload.');
    } finally {
      setIsLoading(false);
    }
  }, [toast, memberData, medicalCodes, availableClaims]);


  useEffect(() => {
    fetchCoreData();
  }, [fetchCoreData]);


  const handleReset = () => { // Admin Panel Reset
    setCurrentStep(0);
    resetFlowStates(); // Resets flow states and sets processingClaims to 0

    // Explicitly reset validated and rejected claims for a full admin reset, preserve totalClaims
    setDashboardMetrics(prev => ({ 
      ...initialDashboardMetrics, 
      totalClaims: prev.totalClaims, 
    }));

    if (initialClaimData && selectedClaimFile) { // Only reload if a claim was truly selected and processed
      setClaimData(JSON.parse(JSON.stringify(initialClaimData))); 
      setAiStepSummary(`Claim "${selectedClaimFile.name}" reloaded. Click "Start Processing This Claim" to begin.`);
    } else { // If no claim was fully loaded or if it's the initial state
      setClaimData(null); 
      setInitialClaimData(null);
      setSelectedClaimFile(null);
      setAiStepSummary('Select a claim to begin processing.');
    }
    toast({ title: "Process Fully Reset", description: "Current claim process and dashboard counts (validated/rejected) have been reset." });
  };

  const handleProcessAnotherClaim = () => {
    setCurrentStep(0);
    resetFlowStates(); // Resets flow states and sets processingClaims to 0. Validated/Rejected are preserved by this function.
    setClaimData(null);
    setInitialClaimData(null);
    setSelectedClaimFile(null);
        
    setAiStepSummary('Previous claim processed. Select a new claim to begin processing.');
    toast({ title: "Ready for Next Claim", description: "Please select a new claim to process." });
    setIsClaimSelectionModalOpen(true);
  };


  const handleSelectClaimFile = (file: AvailableClaimFile) => {
    setSelectedClaimFile(file);
    loadClaimSpecificData(file.path); 
    setIsClaimSelectionModalOpen(false);
  };

  const proceedToNextStep = () => {
    if (!claimData) {
      toast({ title: "No Claim Loaded", description: "Please select a claim to process first.", variant: "destructive"});
      setIsClaimSelectionModalOpen(true);
      return;
    }
    if (currentStep < 7) { 
      setCurrentStep(prev => prev + 1);
      setCurrentStepStatus('pending');
      setAiStepSummary('Preparing for the next step...');
    }
  };

  const handleShowOverrideModal = (title: string, message: string, onConfirmAction: () => void) => {
    setOverrideModalConfig({ title, message, onConfirm: onConfirmAction });
    setIsOverrideModalOpen(true);
  };

  const handleProcessStep = useCallback(async () => {
    if (!claimData || !memberData || !medicalCodes) {
      toast({ title: "Data Missing", description: "Core or claim data not loaded. Cannot process.", variant: "destructive" });
      if (!claimData) setIsClaimSelectionModalOpen(true);
      return;
    }
    
    setIsLoading(true);
    setCurrentStepStatus('in-progress');
    setDashboardMetrics(prev => ({ ...prev, processingClaims: 1 }));
    
    try {
      switch (currentStep) {
        case 1: // Claim Submission (already done by loading)
          setAiStepSummary("Claim data and documents received and registered.");
          setCurrentStepStatus('completed');
          break;

        case 2: // Eligibility Check
          setAiStepSummary("Performing initial eligibility checks...");
          const searchAadhaar = claimData.claimantAadhaar.trim();
          const searchPolicyNumber = claimData.policyNumber.trim();

          if (!memberData || !Array.isArray(memberData.members) || memberData.members.length === 0) {
            setEligibilityCheckResult({ status: 'Ineligible', message: 'Member data is not available or empty. Cannot perform eligibility check.' });
            setAiStepSummary('Member data is missing or empty. Please check data files and ensure member_data.json is correctly populated and loaded.');
            setCurrentStepStatus('error');
            // Do not update rejectedClaims here, Step 6 handles final decision
            break;
          }
          
          const member = memberData.members.find(m =>
            m.aadhaarNumber.trim() === searchAadhaar &&
            m.policyNumber.trim() === searchPolicyNumber
          );

          if (member && member.policyStatus === 'Active') {
            setEligibilityCheckResult({ status: 'Eligible', message: `Policy ${member.policyNumber.trim()} is Active for ${member.name.trim()}. Premium paid on ${member.premiumPaidDate}.` });
            setAiStepSummary(`Policy holder ${member.name.trim()} is eligible. Policy status: Active.`);
            setCurrentStepStatus('completed');
          } else {
            let reason = `Policy/Member not found. Searched Aadhaar: '${searchAadhaar}', Policy: '${searchPolicyNumber}'.`;
            if (member && member.policyStatus !== 'Active') {
              reason = `Policy found for ${member.name.trim()} (Aadhaar: ${member.aadhaarNumber.trim()}, Policy: ${member.policyNumber.trim()}) but status is ${member.policyStatus}.`;
            }
            setEligibilityCheckResult({ status: 'Ineligible', message: reason });
            setAiStepSummary(`Claimant is ineligible. ${reason}`);
            setCurrentStepStatus('error'); 
          }
          break;

        case 3: // OCR + GenAI
          setAiStepSummary("Extracting data from documents using AI (simulated OCR)...");
          const currentClaimDataForOcr = JSON.parse(JSON.stringify(claimData));
          const ocrResult = await extractAndFillClaimData({
            claimDocumentDataUri: PLACEHOLDER_IMAGE_DATA_URI,
            currentClaimData: currentClaimDataForOcr,
          });
          setOcrOutput(ocrResult);
          setClaimData(prev => ({ ...prev!, ...ocrResult }));
          const newFieldsCount = Object.keys(ocrResult).filter(key => !(key in currentClaimDataForOcr) || currentClaimDataForOcr[key] !== ocrResult[key]).length;
          setAiStepSummary(`AI has extracted and potentially updated data. ${newFieldsCount} fields affected. Review extracted data below.`);
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
            if (consistencyResult.inconsistencies.some(inc => inc.toLowerCase().includes("critical") || inc.toLowerCase().includes("missing document"))) {
              setClaimData(prev => ({...prev!, missingInformation: consistencyResult.inconsistencies}));
              setCurrentStep(7); 
              setIsLoading(false); 
              setDashboardMetrics(prev => ({ ...prev, processingClaims: 0 })); // Moved to step 7 explicitly
              return; 
            }
          } else {
            setAiStepSummary("AI consistency check passed. No major inconsistencies found.");
          }
          setCurrentStepStatus('completed');
          break;

        case 5: // Eligibility Verification (Medical Codes)
          setAiStepSummary("Verifying medical eligibility based on codes...");
          let isMedicallyEligible = false;
          let medicalVerificationMessage = "No eligible medical codes found or codes conflict with policy rules.";
          
          const codesToVerify = claimData.medicalCodes || (ocrOutput?.medicalCodes as string[]) || [];

          if (codesToVerify.length > 0) {
            isMedicallyEligible = codesToVerify.some(code => medicalCodes.eligibleCodes.includes(code)) &&
                         !codesToVerify.some(code => medicalCodes.ineligibleCodes.includes(code));
            if(isMedicallyEligible) {
              medicalVerificationMessage = `Medical codes ${codesToVerify.join(', ')} verified. Claim appears medically eligible.`;
            } else {
              medicalVerificationMessage = `Medical codes ${codesToVerify.join(', ')} include ineligible codes or miss eligible ones.`;
            }
          }
          setMedicalVerificationResult({ status: isMedicallyEligible ? 'Eligible' : 'Ineligible', message: medicalVerificationMessage, isEligible: isMedicallyEligible });
          setAiStepSummary(medicalVerificationMessage);
          setCurrentStepStatus(isMedicallyEligible ? 'completed' : 'error');
          // Do not update rejectedClaims here
          break;

        case 6: // Summary & Decision
          if (!medicalVerificationResult || !eligibilityCheckResult) { 
             setAiStepSummary("Eligibility and Medical verification must be completed first.");
             setCurrentStepStatus('error');
             // Ensure processingClaims is set to 0 if we error out here before decision
             setDashboardMetrics(prev => ({ ...prev, processingClaims: 0 }));
             break;
          }
          
          const wasEligibilityOverridden = eligibilityCheckResult.status === 'Ineligible' && medicalVerificationResult?.isEligible === true; 
          const wasMedicalOverridden = medicalVerificationResult?.isEligible === false && eligibilityCheckResult.status === 'Eligible'; 
          const bothOverridden = eligibilityCheckResult.status === 'Ineligible' && medicalVerificationResult?.isEligible === false;


          setAiStepSummary("Generating final decision summary with AI...");
          
          let isOverallEligible = (eligibilityCheckResult.status === 'Eligible' && medicalVerificationResult.isEligible);
          // Check if an override occurred. If an override button was clicked, the corresponding status would have been effectively 'Eligible' for this check.
          // The actual results are in eligibilityCheckResult and medicalVerificationResult
          // If overrideModalConfig.onConfirm was called, it called proceedToNextStep. The results are still the original ones.
          // We need to track if override happened. A simple way is to see if proceedToNextStep was called despite error.
          // Let's re-evaluate isOverallEligible based on current component state.

          const userOverrodeEligibility = eligibilityCheckResult.status === 'Ineligible' && (overrideModalConfig?.title.includes("Eligibility"));
          const userOverrodeMedical = medicalVerificationResult.isEligible === false && (overrideModalConfig?.title.includes("Medical"));

          isOverallEligible = (eligibilityCheckResult.status === 'Eligible' || userOverrodeEligibility) && 
                              (medicalVerificationResult.isEligible || userOverrodeMedical);


          const settlementAmount = isOverallEligible ? claimData.claimedAmount * 0.9 : 0; 
          setClaimData(prev => ({ ...prev!, settlementAmount }));

          const summaryResult = await generateClaimSummary({
            claimAmount: claimData.claimedAmount,
            settlementAmount: settlementAmount,
            isEligible: isOverallEligible,
            reason: `Eligibility: ${eligibilityCheckResult.message}. Medical Verification: ${medicalVerificationResult.message}. Overrides applied if applicable.`,
          });
          setDecisionSummary(summaryResult);
          setAiStepSummary(<>Decision: <strong>{summaryResult.decision}</strong>. {summaryResult.summary}</>);
          setCurrentStepStatus('completed');
          if (summaryResult.decision === 'Approved') {
            setDashboardMetrics(prev => ({ ...prev, processingClaims: 0, validatedClaims: prev.validatedClaims + 1 }));
          } else {
            setDashboardMetrics(prev => ({ ...prev, processingClaims: 0, rejectedClaims: prev.rejectedClaims + 1 }));
          }
          setOverrideModalConfig(null); // Clear override state after decision
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
          setDashboardMetrics(prev => ({ ...prev, processingClaims: 0 })); 
          break;
        
        default:
          setAiStepSummary("Unknown step or process not started.");
          setCurrentStepStatus('pending');
          setDashboardMetrics(prev => ({ ...prev, processingClaims: 0 }));
      }
    } catch (error: any) {
      console.error(`Error in step ${currentStep}:`, error);
      toast({ title: `Error in Step ${currentStep}`, description: error.message || "An unexpected error occurred.", variant: "destructive" });
      setCurrentStepStatus('error');
      setAiStepSummary(`An error occurred: ${error.message}. Check console for details.`);
      setDashboardMetrics(prev => ({ ...prev, processingClaims: 0 })); 
    } finally {
      if (!(currentStep === 4 && claimData?.missingInformation?.length && claimData.missingInformation.length > 0 && currentStepStatus !== 'completed')) {
         setIsLoading(false);
      }
      // Reset override config if the step is completed or errored out without override path.
      if (currentStepStatus === 'completed' || (currentStepStatus === 'error' && !(currentStep === 2 || currentStep === 5))) {
        setOverrideModalConfig(null);
      }
    }
  }, [currentStep, claimData, memberData, medicalCodes, toast, ocrOutput, eligibilityCheckResult, medicalVerificationResult, overrideModalConfig, availableClaims, resetFlowStates]);

  const renderStepContent = () => {
    if (isLoading && !claimData && currentStep === 0 && availableClaims.length === 0) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /> <p className="ml-4 text-lg">Loading Application Data...</p></div>;
    
    const commonActionButton = (text: string = "Process This Step") => ({
      text: text,
      onClick: handleProcessStep,
      disabled: isLoading || currentStepStatus === 'completed' || (currentStepStatus === 'error' && currentStep !== 7 && currentStep !== 2 && currentStep !== 5),
      loading: isLoading && currentStepStatus === 'in-progress',
    });
    
    const nextStepButton = (text: string = "Proceed to Next Step") => ({
        text: text,
        onClick: proceedToNextStep,
        disabled: isLoading || (currentStepStatus !== 'completed' && !(currentStepStatus === 'error' && (currentStep === 2 || currentStep === 5)) && currentStepStatus !== 'info'),
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
              {claimData ? (
                <>
                  <p className="mb-2">Currently loaded: <strong>{selectedClaimFile?.name || 'Unknown Claim'}</strong> (ID: {claimData.claimId})</p>
                  <p className="mb-6">{aiStepSummary || 'Click the button below to start processing this claim.'}</p>
                  <Button size="lg" onClick={proceedToNextStep} disabled={isLoading}>
                    Start Processing This Claim
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => setIsClaimSelectionModalOpen(true)} disabled={isLoading} className="ml-4">
                    <List className="mr-2 h-5 w-5" /> Select Different Claim
                  </Button>
                </>
              ) : (
                <>
                  <p className="mb-6">{aiStepSummary || 'Please select a claim to begin processing.'}</p>
                  <Button size="lg" onClick={() => setIsClaimSelectionModalOpen(true)} disabled={isLoading || availableClaims.length === 0}>
                     <List className="mr-2 h-5 w-5" /> Select Claim to Process
                  </Button>
                   {availableClaims.length === 0 && !isLoading && <p className="text-sm text-muted-foreground mt-2">Loading claim list or no claims found...</p>}
                </>
              )}
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
            actionButton={
              currentStepStatus === 'completed' ? nextStepButton() :
              (eligibilityCheckResult?.status === 'Ineligible' && currentStepStatus === 'error' ?
                {
                  text: "Override Eligibility Issue?",
                  onClick: () => handleShowOverrideModal(
                    "Confirm Override: Eligibility",
                    `${eligibilityCheckResult.message}. Do you want to override this and continue processing?`,
                    () => {
                      proceedToNextStep();
                    }
                  ),
                  disabled: isLoading,
                  variant: "destructive" as const // Cast for Button variant prop
                } :
                commonActionButton())
            }
          >
            {eligibilityCheckResult && (
              <p className={`font-semibold ${eligibilityCheckResult.status === 'Eligible' ? 'text-google-green' : 'text-google-red'}`}>
                {eligibilityCheckResult.status}: {eligibilityCheckResult.message}
              </p>
            )}
            <ClaimDetailsView data={{ claimantAadhaar: claimData?.claimantAadhaar, policyNumber: claimData?.policyNumber }} title="Data Used for Check" />
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
      case 5: // Medical Eligibility Verification
        return (
          <ClaimStepCard
            stepNumber={5} title="Medical Eligibility Verification" status={currentStepStatus}
            aiSummary={aiStepSummary} borderColorClass={GOOGLE_COLORS.blue}
            actionButton={
              currentStepStatus === 'completed' ? nextStepButton() :
              (medicalVerificationResult?.isEligible === false && currentStepStatus === 'error' ?
                {
                  text: "Override Medical Ineligibility?",
                  onClick: () => handleShowOverrideModal(
                    "Confirm Override: Medical Verification",
                    `${medicalVerificationResult.message}. Do you want to override this and continue processing?`,
                    () => {
                       proceedToNextStep();
                    }
                  ),
                  disabled: isLoading,
                  variant: "destructive" as const // Cast for Button variant prop
                } :
                commonActionButton())
            }
          >
            {medicalVerificationResult && (
              <p className={`font-semibold ${medicalVerificationResult.isEligible ? 'text-google-green' : 'text-google-red'}`}>
                Status: {medicalVerificationResult.isEligible ? 'Eligible' : 'Ineligible'} - {medicalVerificationResult.message}
              </p>
            )}
             <ClaimDetailsView data={{ medicalCodesUsed: claimData?.medicalCodes, rulesSnapshot: medicalCodes?.eligibleCodes.slice(0,2).concat(medicalCodes.ineligibleCodes.slice(0,1)) }} title="Data Used for Verification" />
          </ClaimStepCard>
        );
      case 6: // Summary & Decision
        return (
          <ClaimStepCard
            stepNumber={6} title="Final Summary & Decision" status={currentStepStatus}
            aiSummary={aiStepSummary}
            borderColorClass={decisionSummary?.decision === 'Approved' ? GOOGLE_COLORS.green : (decisionSummary?.decision === 'Rejected' ? GOOGLE_COLORS.red : GOOGLE_COLORS.muted)}
            actionButton={
              currentStepStatus === 'completed' ? 
              { 
                text: "Process Another Claim", 
                onClick: handleProcessAnotherClaim,
                disabled: isLoading 
              } : 
              commonActionButton()
            }
          >
            {decisionSummary && claimData && (
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
                    if (!claimData) return;
                    setClaimData(prev => ({ ...prev!, missingInformation: [], diagnosis: prev?.diagnosis || "Updated Diagnosis after missing info provided" }));
                    setCurrentStep(4); 
                    setCurrentStepStatus('pending');
                    setAiStepSummary('Simulated information provided. Retrying consistency check...');
                    setIsLoading(false); 
                    // Ensure processingClaims is correctly set when moving back
                    setDashboardMetrics(prev => ({ ...prev, processingClaims: 0 }));
                },
                disabled: isLoading || !claimData,
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
             <ClaimDetailsView data={{missingItems: claimData?.missingInformation}} title="Items Marked as Missing" />
          </ClaimStepCard>
        );
      default:
        return <p>Invalid step. Please select a claim to start.</p>;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8">
        <DashboardMetrics {...dashboardMetrics} />
        
        {renderStepContent()}

        <AdminPanel onReset={handleReset} />

        <Dialog open={isClaimSelectionModalOpen} onOpenChange={setIsClaimSelectionModalOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Select Claim to Process</DialogTitle>
              <DialogDescription>
                Choose a claim file from the list below to start the validation process.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[300px] my-4">
              <div className="grid gap-2 p-1">
                {availableClaims.length > 0 ? availableClaims.map((file) => (
                  <Button
                    key={file.path}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleSelectClaimFile(file)}
                  >
                    {file.name}
                  </Button>
                )) : <p>No claim files found. Check `public/data/available_claims.json`.</p>}
              </div>
            </ScrollArea>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isOverrideModalOpen} onOpenChange={setIsOverrideModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{overrideModalConfig?.title}</DialogTitle>
              <DialogDescription>
                {overrideModalConfig?.message}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:justify-end">
              <Button variant="outline" onClick={() => {setIsOverrideModalOpen(false); setOverrideModalConfig(null);}}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (overrideModalConfig) {
                    overrideModalConfig.onConfirm();
                  }
                  setIsOverrideModalOpen(false);
                  // setOverrideModalConfig(null); // Cleared in onConfirm or finally block
                }}
              >
                Yes, Continue Processing
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </main>
      <footer className="text-center py-4 text-sm text-muted-foreground border-t">
        ClaimWise AI &copy; {new Date().getFullYear()} - Powered by Firebase Studio & Genkit
      </footer>
    </div>
  );
}
      
