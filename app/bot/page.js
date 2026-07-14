import FeaturePreview from '../components/FeaturePreview';

export const metadata = { title: 'Meeting Bot — Silent Meeting Copilot' };

export default function BotPage() {
  return (
    <FeaturePreview
      eyebrow="Meeting bot"
      title="Zoom Meeting Bot"
      tagline="SMC joins the call as a participant, so your coaching hears exactly what the room hears."
      status="In live testing"
      points={[
        { title: 'Joins on invitation', body: 'Give it a meeting number and it joins like any participant, waiting-room aware and visible to everyone.' },
        { title: 'Room audio, first-hand', body: 'Streams the meeting audio straight into your live cockpit, with no capture software needed on your machine.' },
        { title: 'Under your control', body: 'It announces itself, joins only meetings you invite it to, and leaves the moment you tell it to.' },
        { title: 'The platform for more', body: 'The bot is the foundation for Live Translation and richer in-meeting presence on the roadmap.' },
      ]}
      footnote="The bot has already authenticated against Zoom and is in live join testing now."
    />
  );
}
