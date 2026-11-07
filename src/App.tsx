import { useCallback, useMemo, useState } from 'react';
import EmergencyFooter from '@/components/common/Emergencyfooters';
import LandingPage from '@/components/landing/LandingPage';
import PatientIntakeForm from '@/components/intake/PatientIntakeForm';
import AnalysisLoader from '@/components/questionnaire/AnalysisLoader';
import QuestionnaireScreen from '@/components/questionnaire/QuestionnaireScreen';
import ResultDashboard from '@/components/dashboard/ResultDashboard';
import type { IndicatorId } from '@/data/indicators';
import { computeAssessment, sanitizeTagSelections, type Answers, type TagSelection, type TagSelections } from '@/lib/hhs';
import { assessRuqyah } from '@/lib/ruqyah';
import type { PatientIntake } from '@/types/intake';

type Step = 'landing' | 'intake' | 'questionnaire' | 'loading' | 'dashboard';

function App() {
  const [step, setStep] = useState<Step>('landing');
  const [patient, setPatient] = useState<PatientIntake | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [tagSelections, setTagSelections] = useState<TagSelections>({});
  const [startIndex, setStartIndex] = useState(0);
  const [assessmentDate, setAssessmentDate] = useState<Date | null>(null);

  const assessment = useMemo(() => computeAssessment(answers), [answers]);
  const ruqyah = useMemo(() => assessRuqyah(assessment), [assessment]);

  const handleAnswer = useCallback(
    (id: IndicatorId, value: number | null) => {
      const next: Answers = { ...answers, [id]: value };
      setAnswers(next);
      // Micro-Tags hanya berlaku untuk skor 1-2; bila skor berubah, tag yang tidak berlaku dibuang.
      setTagSelections((current) => sanitizeTagSelections(next, current));
    },
    [answers]
  );

  const handleTagsChange = useCallback((id: IndicatorId, selection: TagSelection) => {
    setTagSelections((current) => ({ ...current, [id]: selection }));
  }, []);

  const handleLoadingDone = useCallback(() => {
    setAssessmentDate(new Date());
    setStep('dashboard');
  }, []);

  function handleRestart() {
    setPatient(null);
    setAnswers({});
    setTagSelections({});
    setStartIndex(0);
    setAssessmentDate(null);
    setStep('landing');
  }

  let screen;
  if (step === 'intake') {
    screen = (
      <PatientIntakeForm
        initial={patient}
        onBack={() => setStep('landing')}
        onSubmit={(intake) => {
          setPatient(intake);
          setStartIndex(0);
          setStep('questionnaire');
        }}
      />
    );
  } else if (step === 'questionnaire') {
    screen = (
      <QuestionnaireScreen
        key={startIndex}
        answers={answers}
        tagSelections={tagSelections}
        startIndex={startIndex}
        onAnswer={handleAnswer}
        onTagsChange={handleTagsChange}
        onBack={() => setStep('intake')}
        onComplete={() => setStep('loading')}
      />
    );
  } else if (step === 'loading') {
    screen = <AnalysisLoader onDone={handleLoadingDone} />;
  } else if (step === 'dashboard' && patient && assessmentDate) {
    screen = (
      <ResultDashboard
        patient={patient}
        assessment={assessment}
        ruqyah={ruqyah}
        answers={answers}
        tagSelections={tagSelections}
        assessmentDate={assessmentDate}
        onRestart={handleRestart}
        onCompleteAnswers={(indicatorIndex) => {
          setStartIndex(indicatorIndex);
          setStep('questionnaire');
        }}
      />
    );
  } else {
    screen = <LandingPage onStart={() => setStep('intake')} />;
  }

  return (
    <>
      {screen}
      <EmergencyFooter />
    </>
  );
}

export default App;