import FeaturePreview from '../components/FeaturePreview';

export const metadata = { title: 'Meeting Bot — Silent Meeting Copilot' };

export default function BotPage() {
  return (
    <FeaturePreview
      eyebrow="Meeting bot"
      title="Meeting Bot"
      tagline="One bot for your meetings, wherever they happen: it joins the call as a participant, so your coaching hears exactly what the room hears."
      status="Zoom in live testing · Microsoft Teams planned"
      points={[
        { title: 'Zoom, today', body: 'The bot has authenticated against Zoom and is in live join testing now: give it a meeting number and it joins like any participant, waiting-room aware and visible to everyone.' },
        { title: 'Microsoft Teams, next', body: 'The Teams bot joins through Microsoft\u2019s official cloud communications interface with tenant-admin consent, receiving meeting audio through Microsoft\u2019s real-time media pipeline. Same bot identity, same coaching engine.' },
        { title: 'Room audio, first-hand', body: 'Meeting audio streams straight into your live cockpit on any platform, with no capture software needed on your machine.' },
        { title: 'Under your control', body: 'It announces itself, joins only meetings you invite it to, and leaves the moment you tell it to. It is also the platform for Live Translation in the bot\u2019s video tile.' },
      ]}
      footnote="One Meeting Bot across platforms is the product: Zoom is the first integration, Teams follows on the same pipeline, and further platforms become integrations rather than rebuilds."
    />
  );
}
