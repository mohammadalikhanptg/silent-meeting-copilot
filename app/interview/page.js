import FeaturePreview from '../components/FeaturePreview';

export const metadata = { title: 'Interview Mode — Silent Meeting Copilot' };

export default function InterviewPage() {
  return (
    <FeaturePreview
      eyebrow="Verticals"
      title="Interview Mode"
      tagline="Coaching tuned for the highest-stakes conversation of all: perform at your best, fairly."
      status="In development"
      points={[
        { title: 'Delivery coaching', body: 'Structure, clarity, pacing and confidence prompts tuned specifically for interview dynamics.' },
        { title: 'Your own material', body: 'Reminders drawn from your CV, your preparation notes and the job description, surfaced at the right moment.' },
        { title: 'Missed-point prompts', body: 'If you prepared a point and the moment passes without it, you get a nudge before the window closes.' },
        { title: 'Integrity by design', body: 'It coaches how you communicate what you know. It will not fabricate experience, answer test questions for you, or bypass interviewer rules.' },
      ]}
      footnote="Interview Mode ships with a strict integrity boundary as a product principle, not a setting."
    />
  );
}
