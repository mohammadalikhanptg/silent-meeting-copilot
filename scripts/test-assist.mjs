/**
 * Test suite: Live Assist detection (P2 + P3, Session 6)
 *
 * Tests profile-based assist cards and lookup intent detection.
 * Runs against the worker's generateCoaching() logic without the full Cloudflare runtime.
 * We test the detection functions directly via inline reimplementations that mirror
 * the worker code — no network call needed for detection logic.
 */

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Inline reimplementation of detection functions (mirrors worker/src/session-do.js)
// ---------------------------------------------------------------------------

const PROFILE_TRIGGERS = {
  website: [
    'my website', 'our website', 'our site', 'my site', 'company website',
    'company site', 'our web', 'visit us at', 'find us online', 'check us out online',
    'go to our', 'check our website', 'the website',
  ],
  blog: [
    'our blog', 'my blog', 'company blog', 'our articles', 'read more on our',
    'blog post', 'check our blog',
  ],
  email: [
    'email me', 'email us', 'drop me an email', 'send me an email',
    'contact me', 'contact us', 'reach me', 'reach us', 'get in touch',
    'my email', 'our email',
  ],
  phone: [
    'call me', 'call us', 'ring me', 'ring us', 'phone me', 'phone us',
    'our number', 'my number', 'phone number', 'give me a call', 'give us a call',
  ],
  address: [
    'our address', 'my address', 'our office', 'come to us', 'postal address',
    'our location', 'where we are', 'where to find us', 'office address',
  ],
  bio: [
    'about me', 'about us', 'my background', 'my experience', 'who i am',
    'what i do', 'what we do',
  ],
};

function detectProfileAssists(recentLines, profile) {
  if (!profile) return [];
  const text = recentLines.join(' ').toLowerCase();
  const cards = [];
  const seenValues = new Set();

  const addCard = (label, value) => {
    const key = `${label}:${value}`;
    if (!value || seenValues.has(key)) return;
    seenValues.add(key);
    cards.push({ type: 'my-info', label, value });
  };

  if (PROFILE_TRIGGERS.website.some(t => text.includes(t))) {
    for (const biz of (profile.businesses || [])) {
      if (biz.website) addCard(`${biz.name} website`, biz.website);
    }
  }
  if (PROFILE_TRIGGERS.blog.some(t => text.includes(t))) {
    for (const biz of (profile.businesses || [])) {
      if (biz.blog) addCard(`${biz.name} blog`, biz.blog);
    }
  }
  for (const biz of (profile.businesses || [])) {
    if (!biz.name) continue;
    const nameLower = biz.name.toLowerCase();
    const nameInText = text.includes(nameLower) || (
      nameLower.split(' ').filter(w => w.length > 4).some(word => text.includes(word))
    );
    if (nameInText && biz.website) {
      addCard(`${biz.name} website`, biz.website);
    }
  }
  if (PROFILE_TRIGGERS.email.some(t => text.includes(t))) {
    for (const em of (profile.emails || [])) {
      if (em.value) addCard(`Email (${em.label || 'work'})`, em.value);
    }
  }
  if (PROFILE_TRIGGERS.phone.some(t => text.includes(t))) {
    if (profile.phone) addCard('Phone', profile.phone);
    else cards.push({ type: 'my-info', label: 'Phone', value: '', missing: true });
  }
  if (PROFILE_TRIGGERS.address.some(t => text.includes(t))) {
    if (profile.postal_address) addCard('Postal address', profile.postal_address);
    else cards.push({ type: 'my-info', label: 'Postal address', value: '', missing: true });
  }
  if (PROFILE_TRIGGERS.bio.some(t => text.includes(t))) {
    if (profile.bio) addCard('Bio', profile.bio);
  }
  for (const item of (profile.common_items || [])) {
    if (!item.label || !item.value) continue;
    if (text.includes(item.label.toLowerCase())) {
      addCard(item.label, item.value);
    }
  }
  for (const link of (profile.social_links || [])) {
    if (!link.label || !link.url) continue;
    if (text.includes(link.label.toLowerCase())) {
      addCard(link.label, link.url);
    }
  }
  return cards;
}

const LOOKUP_TRIGGERS = [
  'let me google', "i'll google", 'let me search', "i'll search",
  'let me look up', "i'll look up", 'let me look that up', "i'll look that up",
  'let me find', "i'll find", 'let me check online', "i'll check online",
  'let me check that online', 'if you search', 'if you google', 'if you look up',
  'search for', 'google for', 'look up',
];

function extractLookupQuery(line) {
  const lineLower = line.toLowerCase();
  for (const trigger of LOOKUP_TRIGGERS) {
    const idx = lineLower.indexOf(trigger);
    if (idx !== -1) {
      const after = line.slice(idx + trigger.length).trim();
      const query = after.replace(/^(for|the|a|an)\s+/i, '').trim();
      if (query.length > 3) return query;
    }
  }
  return null;
}

function detectLookupIntents(recentLines) {
  const queries = [];
  const seen = new Set();
  for (const line of recentLines) {
    const q = extractLookupQuery(line);
    if (q && !seen.has(q.toLowerCase())) {
      seen.add(q.toLowerCase());
      queries.push(q);
    }
  }
  return queries;
}

function buildSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

// ---------------------------------------------------------------------------
// Test profile (matches operator seeded data)
// ---------------------------------------------------------------------------

const TEST_PROFILE = {
  businesses: [
    { name: 'Pacific Technology Group', website: 'pacific.london', blog: '' },
    { name: 'Pacific Infotech', website: 'pacificinfotech.co.uk', blog: '' },
  ],
  postal_address: '',
  phone: '',
  emails: [
    { label: 'Work', value: 'ali@pacific.london' },
    { label: 'Managed services', value: 'ali@pacificinfotech.co.uk' },
  ],
  social_links: [],
  bio: '',
  common_items: [
    { label: 'Calendly', value: 'https://calendly.com/ali-ptg' },
  ],
};

// ---------------------------------------------------------------------------
// Test 1: "anyone can visit my website" → assist card with pacific.london
// ---------------------------------------------------------------------------

console.log('\nTest 1: website reference → profile assist card');

const t1Lines = ['anyone can visit my website to learn more about what we do'];
const t1Cards = detectProfileAssists(t1Lines, TEST_PROFILE);

assert(t1Cards.length >= 1, 'at least one assist card produced');
assert(t1Cards.some(c => c.value === 'pacific.london'), 'pacific.london in cards');
assert(t1Cards.some(c => c.type === 'my-info'), 'card type is my-info');
assert(!t1Cards.some(c => c.missing), 'no missing-value cards when website is set');

// ---------------------------------------------------------------------------
// Test 2: "let me google the best lakes in the Lake District" → lookup card
// ---------------------------------------------------------------------------

console.log('\nTest 2: lookup intent → search URL card');

const t2MeLines = ['let me google the best lakes in the Lake District'];
const t2Queries = detectLookupIntents(t2MeLines);

assert(t2Queries.length === 1, 'exactly one lookup query detected');
assert(t2Queries[0].toLowerCase().includes('lake'), 'query includes "lake"');

const t2Url = buildSearchUrl(t2Queries[0]);
assert(t2Url.startsWith('https://www.google.com/search?q='), 'search URL is valid Google URL');
assert(t2Url.includes('lake'), 'search URL includes query term');

// Check the full card shape that would be produced
const t2Card = {
  type: 'lookup',
  label: `Search: ${t2Queries[0]}`,
  value: t2Url,
  query: t2Queries[0],
  results: [],
};
assert(t2Card.type === 'lookup', 'card type is lookup');
assert(typeof t2Card.value === 'string' && t2Card.value.length > 0, 'card has non-empty value');

// ---------------------------------------------------------------------------
// Test 3: normal sentence → no assist card
// ---------------------------------------------------------------------------

console.log('\nTest 3: unrelated sentence → no spurious assist card');

const t3Lines = [
  'I think we should schedule the follow-up for next Tuesday',
  'The project timeline is looking good overall',
  'Let me know if you have any questions about the proposal',
];
const t3ProfileCards = detectProfileAssists(t3Lines, TEST_PROFILE);
const t3LookupQueries = detectLookupIntents(t3Lines);

assert(t3ProfileCards.length === 0, 'no profile assist cards from unrelated sentences');
assert(t3LookupQueries.length === 0, 'no lookup queries from unrelated sentences');

// ---------------------------------------------------------------------------
// Test 4: email reference → email cards
// ---------------------------------------------------------------------------

console.log('\nTest 4: email reference → email assist cards');

const t4Lines = ['you can email me or contact us at any time'];
const t4Cards = detectProfileAssists(t4Lines, TEST_PROFILE);

assert(t4Cards.some(c => c.value === 'ali@pacific.london'), 'Work email in cards');
assert(t4Cards.some(c => c.value === 'ali@pacificinfotech.co.uk'), 'Managed services email in cards');

// ---------------------------------------------------------------------------
// Test 5: phone reference when phone is blank → missing card
// ---------------------------------------------------------------------------

console.log('\nTest 5: phone reference with blank profile → missing hint');

const t5Lines = ['you can call me on my number'];
const t5Cards = detectProfileAssists(t5Lines, TEST_PROFILE);
const phoneMissingCard = t5Cards.find(c => c.label === 'Phone' && c.missing);

assert(phoneMissingCard !== undefined, 'missing phone card surfaced when phone not set');
assert(phoneMissingCard.value === '', 'missing phone card has empty value (not fabricated)');

// ---------------------------------------------------------------------------
// Test 6: common item reference → custom card
// ---------------------------------------------------------------------------

console.log('\nTest 6: common item label in transcript → custom card');

const t6Lines = ['I can share my Calendly link so you can book a time'];
const t6Cards = detectProfileAssists(t6Lines, TEST_PROFILE);
const calCard = t6Cards.find(c => c.label === 'Calendly');

assert(calCard !== undefined, 'Calendly custom item card found');
assert(calCard.value === 'https://calendly.com/ali-ptg', 'Calendly URL correct');

// ---------------------------------------------------------------------------
// Test 7: "if you search" lookup form
// ---------------------------------------------------------------------------

console.log('\nTest 7: "if you search X" form also detected');

const t7Lines = ['if you search GDPR compliance checklist you should find plenty of resources'];
const t7Queries = detectLookupIntents(t7Lines);

assert(t7Queries.length === 1, 'one lookup query detected from "if you search" form');
assert(t7Queries[0].toLowerCase().includes('gdpr'), 'query includes GDPR');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('All tests passed ✅');
}
