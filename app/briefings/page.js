import FeaturePreview from '../components/FeaturePreview';

export const metadata = { title: 'Briefings — Silent Meeting Copilot' };

export default function BriefingsPage() {
  return (
    <FeaturePreview
      eyebrow="Live coaching"
      title="Briefings"
      tagline="Walk in ready. Walk out measured."
      status="In development"
      points={[
        { title: 'Pre-meeting brief', body: 'One screen before you go live: your objective, the key points from your documents, and anything unresolved from previous sessions with the same party.' },
        { title: 'Post-meeting debrief', body: 'A performance report after every session: objective coverage, talk balance, pacing, and what you were asked versus what you answered.' },
        { title: 'Coaching that compounds', body: 'Each debrief highlights one thing to do better next time, chosen from your actual performance.' },
        { title: 'Trends over time', body: 'Debrief scores flow into Insights so you can watch your meeting performance improve week on week.' },
      ]}
    />
  );
}
