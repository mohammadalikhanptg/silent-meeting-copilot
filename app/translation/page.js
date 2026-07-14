import FeaturePreview from '../components/FeaturePreview';

export const metadata = { title: 'Live Translation — Silent Meeting Copilot' };

export default function TranslationPage() {
  return (
    <FeaturePreview
      eyebrow="Meeting bot"
      title="Live Translation"
      tagline="Translated captions rendered inside the bot's own video tile, where everyone is already looking."
      status="In development — pilot planned"
      points={[
        { title: 'No side apps', body: 'No links to open, no QR codes, no second screen. The translation lives inside the meeting itself, in the bot\u2019s video square.' },
        { title: 'Per-person languages', body: 'Before the meeting, assign each participant the language they speak and the language they want to read.' },
        { title: 'Live, both directions', body: 'As each person speaks, the tile shows their words translated for the people who need them.' },
        { title: 'Built for real deals', body: 'Designed for multilingual teams, cross-border negotiations and any room where language is the gap.' },
      ]}
      footnote="No competing product delivers translation inside the meeting's own video grid. This is unique ground, built on our bot platform."
    />
  );
}
