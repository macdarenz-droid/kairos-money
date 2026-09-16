/**
 * What kind of purchase a row is, worked out from what the bank actually wrote.
 *
 * Statement descriptions and push notifications are the only evidence there is — "WOOLWORTHS METRO 1284",
 * "UBER *EATS", "BP CONNECT 2231" — so this reads them, and falls back to the category when the text says
 * nothing useful. It is a presentation hint and nothing else: it never touches an amount, a category or
 * the ledger, so being wrong costs a wrong picture on a row and never a wrong figure.
 *
 * Order is significance, not alphabet. "UBER EATS" has to be food before "UBER" is a car, and "BPAY" has
 * to be a bill before "BP" is a petrol station — which is why these are ordered lists of word-boundary
 * patterns rather than a bag of substrings.
 *
 * Unknown is a real answer with its own mark, not a guess. A merchant nobody has seen before gets the
 * dashed circle rather than being forced into the nearest category, because a confident wrong icon teaches
 * the eye the wrong thing about a row.
 */
export type PurchaseKind =
  | 'groceries' | 'dining' | 'coffee' | 'transport' | 'fuel' | 'shopping' | 'entertainment' | 'music'
  | 'pharmacy' | 'medical' | 'fitness' | 'utilities' | 'telecom' | 'housing' | 'insurance' | 'education'
  | 'pets' | 'travel' | 'cash' | 'transfer' | 'income' | 'subscription' | 'unknown';

/** Each entry is tried in order; the first whose pattern matches wins. */
const RULES: readonly (readonly [PurchaseKind, RegExp])[] = [
  // Delivery and food brands that contain a transport or shop brand must be settled first.
  ['dining', /\b(uber\s*\*?\s*eats|doordash|menulog|deliveroo|hungry\s*jack|mcdonald|maccas|kfc|red rooster|nando|grill'?d|guzman|subway|domino|pizza|sushi|ramen|noodle|burger|kebab|bakery|patisserie|restaurant|bistro|diner|takeaway|thai|indian|chinese|vietnamese)\b/i],
  ['coffee', /\b(coffee|espresso|barista|starbucks|gloria jean|the coffee club|cafe|café)\b/i],
  ['groceries', /\b(woolworths|woolies|coles|aldi|iga|foodland|costco|harris farm|supermarket|grocer|greengrocer|butcher|fruit\s*&?\s*veg)\b/i],
  // BPAY is a bill payment; BP on its own is a service station.
  ['transfer', /\b(bpay|osko|payid|pay id|direct credit|direct debit|transfer|tfr|internal transfer|to savings|from savings)\b/i],
  ['fuel', /\b(bp|shell|caltex|ampol|mobil|united petroleum|7-?eleven|petrol|fuel|servo|service station)\b/i],
  ['transport', /\b(uber|didi|ola|lyft|taxi|cab|opal|myki|go card|translink|metro|transperth|ptv|train|tram|bus|toll|linkt|e-?toll|parking|wilson park|secure park)\b/i],
  ['entertainment', /\b(netflix|disney|stan|binge|kayo|paramount|prime video|hbo|cinema|hoyts|event cinemas|village|imax|ticketek|ticketmaster|steam|playstation|xbox|nintendo)\b/i],
  ['music', /\b(spotify|apple music|tidal|soundcloud|bandcamp|audible)\b/i],
  ['pharmacy', /\b(chemist|pharmacy|priceline|terry white|amcal|blooms)\b/i],
  ['medical', /\b(medical|doctor|dr\.|gp clinic|dental|dentist|physio|hospital|clinic|pathology|radiology|optometr|specsavers)\b/i],
  ['fitness', /\b(gym|fitness|anytime|f45|goodlife|plus fitness|pilates|yoga|crossfit|snap fitness)\b/i],
  ['telecom', /\b(telstra|optus|vodafone|tpg|belong|amaysim|boost mobile|aussie broadband|superloop|nbn|mobile|broadband|internet)\b/i],
  ['utilities', /\b(agl|origin energy|energyaustralia|energy australia|alinta|red energy|simply energy|electricity|water corp|sydney water|yarra valley water|gas|council rates)\b/i],
  ['insurance', /\b(insurance|nrma|aami|allianz|budget direct|racv|racq|bupa|medibank|hcf|nib)\b/i],
  ['housing', /\b(rent|mortgage|real estate|property|strata|body corporate|landlord|home loan)\b/i],
  ['education', /\b(university|uni\b|tafe|school|college|tuition|course|udemy|coursera|skillshare|textbook)\b/i],
  ['pets', /\b(vet|veterinar|petbarn|petstock|pet circle|pet\b)\b/i],
  ['travel', /\b(qantas|virgin australia|jetstar|rex airlines|airbnb|booking\.com|expedia|hotel|motel|hostel|flight|airline|airport)\b/i],
  ['cash', /\b(atm|withdrawal|cash out|cash advance)\b/i],
  ['income', /\b(salary|payroll|wages?|pay run|employer|centrelink|dividend|interest paid)\b/i],
  ['subscription', /\b(subscription|membership|patreon|substack|renewal|monthly plan|icloud|google one|dropbox|adobe|microsoft 365)\b/i],
  ['shopping', /\b(kmart|target|big w|myer|david jones|amazon|ebay|temu|shein|uniqlo|h&m|cotton on|jb hi-?fi|officeworks|bunnings|ikea|rebel sport)\b/i],
];

/** The category a person or an import assigned, when the merchant text gave nothing away. */
const BY_CATEGORY: Readonly<Record<string, PurchaseKind>> = {
  groceries: 'groceries', food: 'dining', 'eating out': 'dining', dining: 'dining', restaurants: 'dining',
  coffee: 'coffee', transport: 'transport', travel: 'travel', fuel: 'fuel', shopping: 'shopping',
  entertainment: 'entertainment', music: 'music', health: 'medical', medical: 'medical',
  pharmacy: 'pharmacy', fitness: 'fitness', utilities: 'utilities', phone: 'telecom', internet: 'telecom',
  housing: 'housing', rent: 'housing', insurance: 'insurance', education: 'education', pets: 'pets',
  cash: 'cash', transfer: 'transfer', income: 'income', savings: 'income', subscriptions: 'subscription',
};

export function purchaseKind(description: string, category?: string | null): PurchaseKind {
  const text = description ?? '';
  for (const [kind, pattern] of RULES) if (pattern.test(text)) return kind;
  const named = (category ?? '').trim().toLowerCase();
  return BY_CATEGORY[named] ?? 'unknown';
}
