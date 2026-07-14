import FeaturePreview from '../components/FeaturePreview';

export const metadata = { title: 'Ask SMC — Silent Meeting Copilot' };

export default function AskPage() {
  return (
    <FeaturePreview
      eyebrow="Live coaching"
      title="Ask SMC"
      tagline="Ask anything mid-meeting and get the answer from your own documents and meeting history, while it still matters."
      status="Planned"
      points={[
        { title: 'In-meeting answers', body: 'Type or whisper a question during the call: what did we quote them last month, what was their objection last time, what does our proposal say about timelines.' },
        { title: 'Your own memory', body: 'Answers come from your preparation documents, your profile, and every previous session with the same party, with the source shown.' },
        { title: 'Live, not retrospective', body: 'Competing tools answer questions about a meeting after it ends. Ask SMC answers during the meeting, when the answer can still change the outcome.' },
        { title: 'Feeds the radar', body: 'Anything you ask that the room later asks you becomes a ready answer on the Expectation Radar.' },
      ]}
    />
  );
}
