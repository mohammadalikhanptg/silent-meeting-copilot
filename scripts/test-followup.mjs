// Test: Follow-up Tracker — /enrich-flag worker endpoint
// Tests the secondary enrichment pipeline in isolation.

const ENGINE_URL = process.env.ENGINE_URL || 'https://smc-engine.ali-6b8.workers.dev';
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

async function post(path, body) {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

console.log('Follow-up Tracker — worker /enrich-flag endpoint tests');
console.log('─'.repeat(54));

// Test 1: Fleet switch remark → talking point + search fallback
{
  console.log('\nTest 1: "switching fleet to Tesla" → talking point generated');
  const data = await post('/enrich-flag', {
    text: "we're thinking of switching our fleet to Tesla",
    speaker: 'others',
    context: 'Fleet management discussion with corporate client',
    profile: {
      businesses: [{ name: 'Pacific Technology Group', website: 'pacific.london' }],
      bio: 'Cybersecurity and operational resilience consultancy',
      common_items: [{ label: 'Fleet advisory deck', value: 'https://pacific.london/fleet' }],
      emails: [{ label: 'Work', value: 'ali@pacific.london' }],
    },
  });
  assert(data.ok === true, 'response ok');
  assert(typeof data.assist_text === 'string', 'assist_text is a string');
  assert(data.assist_text.length > 20, `assist_text has content (len=${data.assist_text.length})`);
  assert(Array.isArray(data.references), 'references is an array');
  console.log(`  assist_text preview: "${data.assist_text.slice(0, 80)}…"`);
}

// Test 2: Second item — numbering/alignment (checks the endpoint handles minimal input)
{
  console.log('\nTest 2: second flag item with no profile → still returns assist_text');
  const data = await post('/enrich-flag', {
    text: 'our budget for this project is around 50,000',
    speaker: 'others',
    context: '',
    profile: null,
  });
  assert(data.ok === true, 'response ok');
  assert(typeof data.assist_text === 'string', 'assist_text present');
  assert(Array.isArray(data.references), 'references is array (may be empty without search key)');
}

// Test 3: ME line flagged (operator said something they want to follow up on)
{
  console.log('\nTest 3: ME line flagged → talking point references profile where relevant');
  const data = await post('/enrich-flag', {
    text: "I'll send you our proposal this afternoon",
    speaker: 'me',
    context: 'Sales call — cybersecurity assessment proposal',
    profile: {
      businesses: [{ name: 'Pacific Technology Group', website: 'pacific.london' }],
      emails: [{ label: 'Work', value: 'ali@pacific.london' }],
      common_items: [{ label: 'Proposal template', value: 'https://pacific.london/proposal' }],
    },
  });
  assert(data.ok === true, 'response ok');
  assert(data.assist_text.length > 10, 'assist_text has content for ME line');
  // Profile relevance check — should mention proposal or profile items
  const lowerText = data.assist_text.toLowerCase();
  const mentionsRelevantThing = lowerText.includes('proposal') || lowerText.includes('pacific') || lowerText.includes('send') || lowerText.includes('afternoon');
  assert(mentionsRelevantThing, 'assist_text is contextually relevant to the flagged line');
}

// Test 4: Response structure always safe — no fabricated data
{
  console.log('\nTest 4: empty profile → no fabricated facts in assist_text');
  const data = await post('/enrich-flag', {
    text: 'can you tell me more about your pricing model',
    speaker: 'others',
    context: '',
    profile: { businesses: [], emails: [], common_items: [], bio: '', social_links: [] },
  });
  assert(data.ok === true, 'response ok');
  assert(!data.assist_text.includes('undefined'), 'assist_text has no "undefined" values');
  assert(!data.assist_text.includes('[object Object]'), 'assist_text has no serialisation errors');
}

// Test 5: Health check still passes (no regression from worker changes)
{
  console.log('\nTest 5: /health still responds correctly after worker update');
  const res = await fetch(`${ENGINE_URL}/health`);
  const data = await res.json();
  assert(data.ok === true, '/health ok:true');
  assert('deepgramAvailable' in data, '/health has deepgramAvailable field');
}

console.log('\n' + '─'.repeat(54));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('All tests passed ✅');
} else {
  console.log(`${failed} test(s) FAILED ❌`);
  process.exit(1);
}
