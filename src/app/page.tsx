
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import DashboardMetrics from '@/components/DashboardMetrics';
import ClaimStepCard from '@/components/ClaimStepCard';
import AdminPanel from '@/components/AdminPanel';
import ClaimDetailsView from '@/components/ClaimDetailsView';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogFooter } from '@/components/ui/dialog';
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
  const [aiStepSummary, setAiStepSummary] = useState<React.ReactNode>('Select a claim to begin processing.');

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
    resetFlowStates(); 

    setDashboardMetrics(prev => ({ 
      ...initialDashboardMetrics, 
      totalClaims: prev.totalClaims, 
    }));

    if (initialClaimData && selectedClaimFile) { 
      setClaimData(JSON.parse(JSON.stringify(initialClaimData))); 
      setAiStepSummary(`Claim "${selectedClaimFile.name}" reloaded. Click "Start Processing This Claim" to begin.`);
    } else { 
      setClaimData(null); 
      setInitialClaimData(null);
      setSelectedClaimFile(null);
      setAiStepSummary('Select a claim to begin processing.');
    }
    toast({ title: "Process Fully Reset", description: "Current claim process and all dashboard counts (except total) have been reset." });
  };

  const handleProcessAnotherClaim = () => {
    setCurrentStep(0);
    resetFlowStates(); 
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

    if (currentStep < 6) { // Max step before "Process Another Claim" is 6.
      const nextStepValue = currentStep + 1;
      let nextStepUserGuidance = 'Preparing for the next step...';

      switch (nextStepValue) {
        case 1:
          nextStepUserGuidance = 'The claim data is loaded. Please click "Register Claim Data" to formally log it in the system (Step 1).';
          break;
        case 2:
          nextStepUserGuidance = 'Claim registered. Now, let\'s check policy and member eligibility (Step 2). Click "Check Member Eligibility".';
          break;
        case 3:
          nextStepUserGuidance = 'Eligibility confirmed (or overridden). Proceeding to AI-powered data extraction from documents (Step 3). Click "Extract Document Data".';
          break;
        case 4:
          nextStepUserGuidance = 'Data extracted. Now, the AI will check for inconsistencies against rules (Step 4). Click "Run Consistency Analysis".';
          break;
        case 5:
          nextStepUserGuidance = 'Consistency check complete. Next, we verify medical eligibility based on codes (Step 5). Click "Verify Medical Codes".';
          break;
        case 6:
          nextStepUserGuidance = 'Medical verification done (or overridden). The AI will now generate a final summary and decision (Step 6). Click "Generate Decision & Summary".';
          break;
      }
      
      setAiStepSummary(nextStepUserGuidance);
      setCurrentStep(nextStepValue);
      setCurrentStepStatus('pending'); 
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
          setAiStepSummary("Claim data and documents received and registered in the system.");
          setCurrentStepStatus('completed');
          break;

        case 2: // Eligibility Check
          setAiStepSummary("Performing initial eligibility checks based on policy status and member data...");
          const searchAadhaar = claimData.claimantAadhaar.trim();
          const searchPolicyNumber = claimData.policyNumber.trim();

          if (!memberData || !Array.isArray(memberData.members) || memberData.members.length === 0) {
            setEligibilityCheckResult({ status: 'Ineligible', message: 'Member data is not available or empty. Cannot perform eligibility check.' });
            setAiStepSummary(<>Member data is missing or empty. Please check <code>public/data/member_data.json</code> and ensure it is correctly populated and loaded.</>);
            setCurrentStepStatus('error');
            setDashboardMetrics(prev => ({ ...prev, processingClaims: 0 }));
            break;
          }
          
          const member = memberData.members.find(m =>
            m.aadhaarNumber.trim() === searchAadhaar &&
            m.policyNumber.trim() === searchPolicyNumber
          );

          if (member && member.policyStatus === 'Active') {
            setEligibilityCheckResult({ status: 'Eligible', message: `Policy ${member.policyNumber.trim()} is Active for ${member.name.trim()}. Premium paid on ${member.premiumPaidDate}.` });
            setAiStepSummary(<>Policy holder <strong>{member.name.trim()}</strong> is eligible. Policy status: Active. Premium paid on {member.premiumPaidDate}.</>);
            setCurrentStepStatus('completed');
          } else {
            let reason = `Policy/Member not found. Searched Aadhaar: '${searchAadhaar}', Policy: '${searchPolicyNumber}'.`;
            if (member && member.policyStatus !== 'Active') {
              reason = `Policy found for ${member.name.trim()} (Aadhaar: ${member.aadhaarNumber.trim()}, Policy: ${member.policyNumber.trim()}) but status is ${member.policyStatus}.`;
            }
            setEligibilityCheckResult({ status: 'Ineligible', message: reason });
            setAiStepSummary(<>Claimant is ineligible. {reason} You can choose to override this or select a different claim.</>);
            setCurrentStepStatus('error'); 
            setDashboardMetrics(prev => ({ ...prev, processingClaims: 0 }));
          }
          break;

        case 3: // OCR + GenAI
          setAiStepSummary("Simulating AI-powered data extraction from claim documents...");
          const currentClaimDataForOcr = JSON.parse(JSON.stringify(claimData));
          const ocrResult = await extractAndFillClaimData({
            claimDocumentDataUri: PLACEHOLDER_IMAGE_DATA_URI,
            currentClaimData: currentClaimDataForOcr,
          });
          setOcrOutput(ocrResult);
          setClaimData(prev => ({ ...prev!, ...ocrResult }));
          const newFieldsCount = Object.keys(ocrResult).filter(key => !(key in currentClaimDataForOcr) || currentClaimDataForOcr[key] !== ocrResult[key]).length;
          setAiStepSummary(`AI has simulated document data extraction and updated the claim. ${newFieldsCount} fields were added or modified. Review extracted data below.`);
          setCurrentStepStatus('completed');
          break;

        case 4: // Consistency Check
          setAiStepSummary("Running AI consistency checks: comparing claim data against predefined rules and known data sources...");
          const consistencyResult = await highlightClaimInconsistencies({
            claimData: JSON.stringify(claimData),
            rules: JSON.stringify(medicalCodes.rules.concat(medicalCodes.eligibleCodes.map(c => `Eligible code: ${c}`)).concat(medicalCodes.ineligibleCodes.map(c => `Ineligible code: ${c}`))),
          });
          setInconsistencies(consistencyResult);
          if (consistencyResult.inconsistencies.length > 0) {
            setAiStepSummary(<>AI found {consistencyResult.inconsistencies.length} potential inconsistencies. Summary: {consistencyResult.summary}. If critical issues like missing documents are found, the process will redirect to request more information.</>);
            setCurrentStepStatus('completed'); // Mark as completed for now, then check for redirect.
            if (consistencyResult.inconsistencies.some(inc => inc.toLowerCase().includes("critical") || inc.toLowerCase().includes("missing document") || inc.toLowerCase().includes("incomplete information"))) {
              setClaimData(prev => ({...prev!, missingInformation: consistencyResult.inconsistencies}));
              setAiStepSummary(<>Critical inconsistencies found: {consistencyResult.summary}. Redirecting to request missing information.</>);
              setCurrentStep(7); 
              setIsLoading(false); 
              setDashboardMetrics(prev => ({ ...prev, processingClaims: 0 }));
              setCurrentStepStatus('info'); // Status for step 7
              return; 
            }
          } else {
            setAiStepSummary("AI consistency check passed. No major inconsistencies found in the claim data.");
            setCurrentStepStatus('completed');
          }
          break;

        case 5: // Eligibility Verification (Medical Codes)
          setAiStepSummary("Verifying medical eligibility based on diagnosis codes and policy rules...");
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
          setAiStepSummary(<>Medical verification result: <strong>{isMedicallyEligible ? 'Eligible' : 'Ineligible'}</strong>. {medicalVerificationMessage} You can choose to override this or select a different claim if ineligible.</>);
          setCurrentStepStatus(isMedicallyEligible ? 'completed' : 'error');
          if (!isMedicallyEligible) {
            setDashboardMetrics(prev => ({ ...prev, processingClaims: 0 }));
          }
          break;

        case 6: // Summary & Decision
          if (!medicalVerificationResult || !eligibilityCheckResult) { 
             setAiStepSummary("Eligibility and Medical verification must be completed first. Please go back if necessary.");
             setCurrentStepStatus('error');
             setDashboardMetrics(prev => ({ ...prev, processingClaims: 0 }));
             break;
          }
          
          setAiStepSummary("Generating final claim decision summary with AI...");
          
          const userOverrodeEligibility = eligibilityCheckResult.status === 'Ineligible' && (overrideModalConfig?.title.includes("Eligibility"));
          const userOverrodeMedical = medicalVerificationResult.isEligible === false && (overrideModalConfig?.title.includes("Medical"));

          let isOverallEligible = (eligibilityCheckResult.status === 'Eligible' || userOverrodeEligibility) && 
                              (medicalVerificationResult.isEligible || userOverrodeMedical);


          const settlementAmount = isOverallEligible ? Math.round(claimData.claimedAmount * 0.9) : 0; 
          setClaimData(prev => ({ ...prev!, settlementAmount }));

          const summaryResult = await generateClaimSummary({
            claimAmount: claimData.claimedAmount,
            settlementAmount: settlementAmount,
            isEligible: isOverallEligible,
            reason: `Policy Eligibility: ${eligibilityCheckResult.message}. Medical Verification: ${medicalVerificationResult.message}. Overrides applied: Policy Override - ${userOverrodeEligibility ? 'Yes' : 'No'}, Medical Override - ${userOverrodeMedical ? 'Yes' : 'No'}.`,
          });
          setDecisionSummary(summaryResult);
          setAiStepSummary(<>AI Decision: <strong>{summaryResult.decision}</strong>. {summaryResult.summary}</>);
          setCurrentStepStatus('completed');
          if (summaryResult.decision === 'Approved') {
            setDashboardMetrics(prev => ({ ...prev, processingClaims: 0, validatedClaims: prev.validatedClaims + 1 }));
          } else {
            setDashboardMetrics(prev => ({ ...prev, processingClaims: 0, rejectedClaims: prev.rejectedClaims + 1 }));
          }
          setOverrideModalConfig(null); 
          break;

        case 7: // Missing Info Path
          setAiStepSummary("AI is generating a draft email to request the missing information from the claimant...");
           const missingInfoForEmail = claimData.missingInformation?.length > 0 ? claimData.missingInformation : ["Details about diagnosis", "Copy of ID proof"]; // Fallback if somehow empty

          const emailResult = await generateMissingInfoEmail({
            claimId: claimData.claimId,
            claimantName: claimData.claimantName,
            missingInformation: missingInfoForEmail,
          });
          setMissingInfoEmail(emailResult);
          setAiStepSummary("AI generated a draft email to request missing information. Review details below. Click button to simulate info provided and retry consistency check.");
          setCurrentStepStatus('info');
          setDashboardMetrics(prev => ({ ...prev, processingClaims: 0 })); 
          break;
        
        default:
          setAiStepSummary("Unknown step or process not started. Please select a claim.");
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
      // Ensure isLoading is false unless a redirect to step 7 happened (which sets it to false itself)
      if (!(currentStep === 4 && claimData?.missingInformation?.length && claimData.missingInformation.length > 0 && currentStepStatus !== 'completed')) {
         setIsLoading(false);
      }
      // Clear override config if step completed successfully or if error wasn't an overridable one.
      if (currentStepStatus === 'completed' || (currentStepStatus === 'error' && !(currentStep === 2 || currentStep === 5))) {
        setOverrideModalConfig(null);
      }
    }
  }, [currentStep, claimData, memberData, medicalCodes, toast, ocrOutput, eligibilityCheckResult, medicalVerificationResult, overrideModalConfig, availableClaims, resetFlowStates]);

  const renderStepContent = () => {
    if (isLoading && !claimData && currentStep === 0 && availableClaims.length === 0) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /> <p className="ml-4 text-lg">Loading Application Data...</p></div>;
    
    const commonActionButton = (text: string, processingText?: string) => ({
      text: text,
      onClick: handleProcessStep,
      disabled: isLoading || currentStepStatus === 'completed' || (currentStepStatus === 'error' && currentStep !== 7 && currentStep !== 2 && currentStep !== 5) || !claimData,
      loading: isLoading && currentStepStatus === 'in-progress',
      processingText: processingText || text,
    });
    
    const nextStepButton = (text: string) => ({
        text: text,
        onClick: proceedToNextStep,
        disabled: isLoading || (currentStepStatus !== 'completed' && !(currentStepStatus === 'error' && (currentStep === 2 || currentStep === 5)) && currentStepStatus !== 'info'),
    });

    switch (currentStep) {
      case 0: // Idle / Start
        return (
          <Card className="shadow-xl text-center p-8">
            <CardHeader>
              <CardTitle className="text-3xl font-headline">ClaimWise AI</CardTitle>
              <CardDescription className="underline decoration-red-500 decoration-2">An agentic framework for claim validation - Prototype. </CardDescription>
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
            actionButton={currentStepStatus === 'completed' ? nextStepButton("Proceed to Eligibility Check") : commonActionButton("Register Claim Data")}
          >
            <ClaimDetailsView data={claimData} title="Initial Claim Data" />
          </ClaimStepCard>
        );
      case 2: // Policy & Member Eligibility Check
        return (
          <ClaimStepCard
            stepNumber={2} title="Policy & Member Eligibility Check" status={currentStepStatus}
            aiSummary={aiStepSummary} borderColorClass={GOOGLE_COLORS.yellow}
            actionButton={
              currentStepStatus === 'completed' ? nextStepButton("Proceed to Data Extraction") :
              (eligibilityCheckResult?.status === 'Ineligible' && currentStepStatus === 'error' ?
                null : // Buttons are in CardFooter for this case
                commonActionButton("Check Member Eligibility"))
            }
          >
            {eligibilityCheckResult && (
              <p className={`font-semibold ${eligibilityCheckResult.status === 'Eligible' ? 'text-google-green' : 'text-google-red'}`}>
                {eligibilityCheckResult.status}: {eligibilityCheckResult.message}
              </p>
            )}
            <ClaimDetailsView data={{ claimantAadhaar: claimData?.claimantAadhaar, policyNumber: claimData?.policyNumber }} title="Data Used for Check" />
            
            {eligibilityCheckResult?.status === 'Ineligible' && currentStepStatus === 'error' && (
              <CardFooter className="pt-4 flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    resetFlowStates();
                    setCurrentStep(0);
                    setClaimData(null);
                    setInitialClaimData(null);
                    setSelectedClaimFile(null);
                    setAiStepSummary('Claim eligibility check failed. Select a new claim or override.');
                    setIsClaimSelectionModalOpen(true);
                    setOverrideModalConfig(null);
                  }}
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                >
                  <List className="mr-2 h-4 w-4" /> Select Different Claim
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleShowOverrideModal(
                    "Override Eligibility Check",
                    `The claim was found to be ineligible: "${eligibilityCheckResult.message}". Do you want to override this and continue processing?`,
                    () => { 
                      setEligibilityCheckResult(prev => ({...prev!, status: 'Eligible (Overridden)', message: `${prev?.message} - Overridden by user.`}));
                      setAiStepSummary('Eligibility overridden by user. Proceeding to next step.');
                      proceedToNextStep(); 
                    }
                  )}
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                >
                  Override Eligibility & Continue
                </Button>
              </CardFooter>
            )}
          </ClaimStepCard>
        );
      case 3: // OCR + GenAI
        return (
          <ClaimStepCard
            stepNumber={3} title="Document Data Extraction (AI)" status={currentStepStatus}
            aiSummary={aiStepSummary} borderColorClass={GOOGLE_COLORS.green}
            actionButton={currentStepStatus === 'completed' ? nextStepButton("Proceed to Consistency Analysis") : commonActionButton("Extract Document Data")}
          >
            {ocrOutput && <ClaimDetailsView data={ocrOutput} title="AI Extracted/Augmented Data" />}
            <p className="text-xs text-muted-foreground mt-2">Simulated document: placeholder 1x1 pixel image used as trigger for AI data augmentation.</p>
          </ClaimStepCard>
        );
      case 4: // Consistency Check
        return (
          <ClaimStepCard
            stepNumber={4} title="Claim Consistency Analysis (AI)" status={currentStepStatus}
            aiSummary={aiStepSummary} borderColorClass={GOOGLE_COLORS.red}
            actionButton={currentStepStatus === 'completed' ? nextStepButton("Proceed to Medical Verification") : commonActionButton("Run Consistency Analysis")}
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
              currentStepStatus === 'completed' ? nextStepButton("Proceed to Final Summary & Decision") :
              (medicalVerificationResult?.isEligible === false && currentStepStatus === 'error' ?
                null : // Buttons are in CardFooter for this case
                commonActionButton("Verify Medical Codes"))
            }
          >
            {medicalVerificationResult && (
              <p className={`font-semibold ${medicalVerificationResult.isEligible ? 'text-google-green' : 'text-google-red'}`}>
                Status: {medicalVerificationResult.isEligible ? 'Eligible' : 'Ineligible'} - {medicalVerificationResult.message}
              </p>
            )}
            <ClaimDetailsView data={{ medicalCodesUsed: claimData?.medicalCodes, eligibleSample: medicalCodes?.eligibleCodes.slice(0,2), ineligibleSample: medicalCodes?.ineligibleCodes.slice(0,1) }} title="Data Used for Verification (Sample)" />
            
            {medicalVerificationResult?.isEligible === false && currentStepStatus === 'error' && (
               <CardFooter className="pt-4 flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    resetFlowStates();
                    setCurrentStep(0);
                    setClaimData(null);
                    setInitialClaimData(null);
                    setSelectedClaimFile(null);
                    setAiStepSummary('Medical verification failed. Select a new claim or override.');
                    setIsClaimSelectionModalOpen(true);
                    setOverrideModalConfig(null);
                  }}
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                >
                  <List className="mr-2 h-4 w-4" /> Select Different Claim
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleShowOverrideModal(
                    "Override Medical Verification",
                    `Medical verification indicated the claim is ineligible: "${medicalVerificationResult.message}". Do you want to override this and continue processing?`,
                    () => { 
                      setMedicalVerificationResult(prev => ({...prev!, isEligible: true, status: 'Eligible (Overridden)', message: `${prev?.message} - Overridden by user.`}));
                      setAiStepSummary('Medical verification overridden by user. Proceeding to next step.');
                      proceedToNextStep(); 
                    }
                  )}
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                >
                  Override Medical Ineligibility & Continue
                </Button>
              </CardFooter>
            )}
          </ClaimStepCard>
        );
      case 6: // Summary & Decision
        return (
          <ClaimStepCard
            stepNumber={6} title="Final Summary & Decision (AI)" status={currentStepStatus}
            aiSummary={aiStepSummary}
            borderColorClass={decisionSummary?.decision === 'Approved' ? GOOGLE_COLORS.green : (decisionSummary?.decision === 'Rejected' ? GOOGLE_COLORS.red : GOOGLE_COLORS.muted)}
            actionButton={
              currentStepStatus === 'completed' ? 
              { 
                text: "Process Another Claim", 
                onClick: handleProcessAnotherClaim,
                disabled: isLoading 
              } : 
              commonActionButton("Generate Decision & Summary")
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
                 <ClaimDetailsView data={{reasoning: decisionSummary.reasoningForDecision || "Provided in summary"}} title="AI Reasoning Snippet"/>
              </>
            )}
             {!decisionSummary && currentStepStatus === 'in-progress' && <p>AI is working on the decision...</p>}
          </ClaimStepCard>
        );
       case 7: // Missing Info Path
        return (
          <ClaimStepCard
            stepNumber={7} title="Missing Information Required" status={currentStepStatus}
            aiSummary={aiStepSummary} borderColorClass={GOOGLE_COLORS.yellow}
             actionButton={{
                text: "Simulate Info Provided & Retry Consistency",
                onClick: () => {
                    if (!claimData) return;
                    setClaimData(prev => ({ ...prev!, missingInformation: [], diagnosis: prev?.diagnosis || "Updated Diagnosis after missing info provided" })); // Simulate info fixed
                    setCurrentStep(4); // Go back to consistency check
                    setCurrentStepStatus('pending');
                    setAiStepSummary('Simulated information provided. Retrying consistency check (Step 4)...');
                    setIsLoading(false); 
                    setDashboardMetrics(prev => ({ ...prev, processingClaims: 0 }));
                },
                disabled: isLoading || !claimData || currentStepStatus !== 'info',
            }}
          >
            {missingInfoEmail && (
              <div className="space-y-2">
                <h5 className="font-semibold">AI Generated Email Draft to Claimant:</h5>
                <p><strong>Subject:</strong> {missingInfoEmail.emailSubject}</p>
                <ScrollArea className="h-40 rounded-md border p-2 bg-secondary/20">
                  <pre className="text-xs whitespace-pre-wrap">{missingInfoEmail.emailBody}</pre>
                </ScrollArea>
              </div>
            )}
             <ClaimDetailsView data={{missingItems: claimData?.missingInformation}} title="Items Marked as Missing/Inconsistent" />
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
            <DialogFooter className="sm:justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => {setIsOverrideModalOpen(false); setOverrideModalConfig(null);}}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (overrideModalConfig) {
                    overrideModalConfig.onConfirm();
                  }
                  setIsOverrideModalOpen(false);
                  // overrideModalConfig is used in handleProcessStep (step 6 decision)
                  // It is cleared there after use, or when a new override is set, or on cancel here.
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
      

    
