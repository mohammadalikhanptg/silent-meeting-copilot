import FeaturePreview from '../components/FeaturePreview';

export const metadata = { title: 'Live Signals — Silent Meeting Copilot' };

export default function SignalsPage() {
  return (
    <FeaturePreview
      eyebrow="Live coaching"
      title="Live Signals"
      tagline="Sentiment, topics and talk patterns read in real time, so you can react in the meeting rather than review after it."
      status="Planned"
      points={[
        { title: 'Live sentiment gauge', body: 'A running read of the room: warming, neutral or cooling, so you notice a shift while you can still address it.' },
        { title: 'Topic and keyword trackers', body: 'Objections, competitor mentions, pricing and budget signals flagged the moment they are spoken, not discovered in a report the next day.' },
        { title: 'Talk-pattern nudges', body: 'Monologue and talk-balance alerts while you speak: a quiet nudge when you have held the floor too long or gone too fast.' },
        { title: 'Buying and risk signals', body: 'Language patterns that indicate intent or hesitation surfaced live, tuned to your meeting objective.' },
      ]}
      footnote="Conversation-intelligence products compute these metrics after the call for review. Live Signals delivers the same intelligence during the conversation, where it changes behaviour."
    />
  );
}
