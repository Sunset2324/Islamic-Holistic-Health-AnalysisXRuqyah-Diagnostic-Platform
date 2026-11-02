import { useCallback, useState } from 'react';
import LandingPage from '@/components/landing/LandingPage';
import PatientIntakeForm from '@/components/intake/PatientIntakeForm';
import AnalysisLoader from '@/components/questionnaire/AnalysisLoader';
import QuestionnaireScreen from '@/components/questionnaire/QuestionnaireScreen';
import ResultDashboard from '@/components/dashboard/ResultDashboard';
import { evaluateScreening, type Answers, type ScreeningResult } from '@/lib/scoring';
import type { PatientIntake } from '@/types/intake';

type Step = 'landing' | 'intake' | 'questionnaire' | 'loading' | 'dashboard';

function App() {
  const [step, setStep] = useState<Step>('landing');
  const [patient, setPatient] = useState<PatientIntake | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<ScreeningResult | null>(null);

  const handleAnswer = useCallback((questionId: number, value: number) => {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }, []);

  const handleLoadingDone = useCallback(() => {
    setResult(evaluateScreening(answers));
    setStep('dashboard');
  }, [answers]);

  function handleRestart() {
    setPatient(null);
    setAnswers({});
    setResult(null);
    setStep('landing');
  }

  if (step === 'intake') {
    return (
      <PatientIntakeForm
        onBack={() => setStep('landing')}
        onSubmit={(intake) => {
          setPatient(intake);
          setStep('questionnaire');
        }}
      />
    );
  }

  if (step === 'questionnaire') {
    return (
      <QuestionnaireScreen
        answers={answers}
        onAnswer={handleAnswer}
        onBack={() => setStep('intake')}
        onComplete={() => setStep('loading')}
      />
    );
  }

  if (step === 'loading') {
    return <AnalysisLoader onDone={handleLoadingDone} />;
  }

  if (step === 'dashboard' && patient && result) {
    return <ResultDashboard patient={patient} result={result} onRestart={handleRestart} />;
  }

  return <LandingPage onStart={() => setStep('intake')} />;
}

export default App;
