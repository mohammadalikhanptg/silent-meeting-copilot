import FeaturePreview from '../components/FeaturePreview';

export const metadata = { title: 'Customer Service Mode — Silent Meeting Copilot' };

export default function CustomerServicePage() {
  return (
    <FeaturePreview
      eyebrow="Verticals"
      title="Customer Service Mode"
      tagline="Your CRM flows to the agent live, so every customer gets the right answer the first time."
      status="In development"
      points={[
        { title: 'Live CRM assist', body: 'As the customer speaks, SMC identifies who they are and what they are asking, and pulls the answer from your CRM: account history, orders, tickets, entitlements, past promises.' },
        { title: 'Answers, not lookups', body: 'The agent is handed a ready response drawn from live data, instead of putting the customer on hold to search three systems.' },
        { title: 'Write-back after the call', body: 'Call notes, dispositions and commitments are logged back to the CRM automatically, so records stay complete without manual entry.' },
        { title: 'Built for your stack', body: 'Designed for Salesforce, HubSpot, Zendesk and Dynamics, with tone and compliance coaching tuned for service conversations.' },
      ]}
      footnote="Note-takers fill your CRM in after the call ends. Customer Service Mode makes the CRM work for the agent while the customer is still on the line. The session type is already scaffolded in Live session preparation."
    />
  );
}
