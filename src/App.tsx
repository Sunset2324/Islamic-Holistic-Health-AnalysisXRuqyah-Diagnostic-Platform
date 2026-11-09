import { useCallback, useMemo, useState } from 'react';
import ConsultantPrototype from '@/components/consultant/ConsultantPrototype';
import EmergencyFooter from '@/components/common/Emergencyfooters';
import LandingPage from '@/components/landing/LandingPage';
import SavedSubmissionBanner from '@/components/landing/SavedSubmissionBanner';
import SubmissionPanel from '@/components/dashboard/SubmissionPanel';
import PatientIntakeForm from '@/components/intake/PatientIntakeForm';
import AnalysisLoader from '@/components/questionnaire/AnalysisLoader';
import QuestionnaireScreen from '@/components/questionnaire/QuestionnaireScreen';
import ResultDashboard from '@/components/dashboard/ResultDashboard';
import type { IndicatorId } from '@/data/indicators';
import { buildPayload } from '@/lib/api';
import { useSubmission } from '@/lib/useSubmission';
import { computeAssessment, sanitizeTagSelections, type Answers, type TagSelection, type TagSelections } from '@/lib/Hhs';
import { assessRuqyah } from '@/lib/ruqyah';
import type { PatientIntake } from '@/types/intake';

type Step = 'landing' | 'intake' | 'questionnaire' | 'loading' | 'dashboard';

function App() {
  // Prototipe konsultan: buka dengan alamat #/konsultan. Belum ada router sungguhan.
  const isConsultantPrototype = typeof window !== 'undefined' && window.location.hash.startsWith('#/konsultan');
  const [step, setStep] = useState<Step>('landing');
  const [patient, setPatient] = useState<PatientIntake | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [tagSelections, setTagSelections] = useState<TagSelections>({});
  const [startIndex, setStartIndex] = useState(0);
  const [assessmentDate, setAssessmentDate] = useState<Date | null>(null);

  const submission = useSubmission();

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

  const { save: saveSubmission, takeRestored } = submission;

  // Simpan ke server setelah analisis selesai. Gagal menyimpan tidak menghalangi hasil sementara tampil.
  const saveCurrent = useCallback(
    (options: { asNew?: boolean } = {}) => {
      if (!patient) return;
      void saveSubmission(() => buildPayload(patient, answers, tagSelections), options);
    },
    [patient, answers, tagSelections, saveSubmission]
  );

  const handleLoadingDone = useCallback(() => {
    setAssessmentDate(new Date());
    setStep('dashboard');
    saveCurrent();
  }, [saveCurrent]);

  function handleOpenSaved() {
    const data = takeRestored();
    if (!data) return;
    setPatient(data.intake);
    setAnswers(data.answers);
    setTagSelections(data.tagSelections);
    setAssessmentDate(new Date(data.updatedAt));
    setStep('dashboard');
  }

  function handleRestart() {
    setPatient(null);
    setAnswers({});
    setTagSelections({});
    setStartIndex(0);
    setAssessmentDate(null);
    setStep('landing');
  }

  if (isConsultantPrototype) return <ConsultantPrototype />;

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
        submissionPanel={
          <SubmissionPanel
            submission={submission}
            onRetry={() => saveCurrent()}
            onSaveAsNew={() => saveCurrent({ asNew: true })}
            onDeleted={() => undefined}
          />
        }
        onCompleteAnswers={(indicatorIndex) => {
          setStartIndex(indicatorIndex);
          setStep('questionnaire');
        }}
      />
    );
  } else {
    screen = (
      <LandingPage
        onStart={() => setStep('intake')}
        banner={<SavedSubmissionBanner restore={submission.restore} onOpen={handleOpenSaved} />}
      />
    );
  }

  return (
    <>
      {screen}
      <EmergencyFooter />
    </>
  );
}

export default App;