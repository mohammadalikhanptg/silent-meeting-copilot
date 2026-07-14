import FeaturePreview from '../components/FeaturePreview';

export const metadata = { title: 'Commitments — Silent Meeting Copilot' };

export default function CommitmentsPage() {
  return (
    <FeaturePreview
      eyebrow="Live coaching"
      title="Commitments"
      tagline="Every promise made in a meeting, tracked to done."
      status="In development"
      points={[
        { title: 'Captured as they happen', body: 'Commitments you make, and commitments made to you, are captured live with an owner and a due date.' },
        { title: 'Chase list after the call', body: 'Open items become a working list the moment the meeting ends, ready to action or delegate.' },
        { title: 'Both directions', body: 'Tracks what you owe others and what others owe you, so follow-through is never one-sided.' },
        { title: 'Feeds your Insights', body: 'Completion rates trend over time in Insights, turning follow-through into a measurable habit.' },
      ]}
      footnote="Built on the follow-up flagging already live in your sessions today, elevated into a full ledger."
    />
  );
}
