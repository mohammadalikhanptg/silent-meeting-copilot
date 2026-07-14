import FeaturePreview from '../components/FeaturePreview';

export const metadata = { title: 'Expectation Radar — Silent Meeting Copilot' };

export default function RadarPage() {
  return (
    <FeaturePreview
      eyebrow="Live coaching"
      title="Expectation Radar"
      tagline="Knows when the room turns to you, and hands you the answer before you have to scramble."
      status="In development — next up"
      points={[
        { title: 'Detects the ask', body: 'Listens for questions and expectations directed at you in real time, not just keywords but who the room is waiting on.' },
        { title: 'Drafts your answer', body: 'Builds a ready response from your own preparation documents, profile and stated objective the moment the ask lands.' },
        { title: 'One tap to expand', body: 'A compact suggestion expands into full talking points when you need more depth.' },
        { title: 'Nothing missed', body: 'Every ask aimed at you is logged, so anything you defer is waiting for you after the meeting.' },
      ]}
      footnote="The radar builds on the live engine already powering your sessions. It reads only your own meeting audio under the same confidentiality rules as everything else in SMC."
    />
  );
}
