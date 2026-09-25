import { merchantName } from '../ingest/normalize';
import type { NormalizedRow } from '../ingest/types';
import type { Driver } from '../core/db/driver';
export type CategoryRule = { id: string; priority: number; merchant: string; category: string };

/**
 * A STANDARD, PUBLISHED MERCHANT CATEGORY CODE MEANS THE SAME THING FOR EVERY CARD ON EARTH.
 *
 * ISO 18245 assigns one four-digit code per kind of business, and a bank's export usually carries it
 * beside the merchant name. Four codes were recognised before this; a card issuer publishes several
 * hundred. This is not exhaustive, but it is every code a household is likely to actually see, so an MCC
 * a statement bothered to include is very rarely wasted.
 */
const mccCategories: Record<string, string> = {
  // Food and groceries
  '5411': 'Groceries', '5422': 'Groceries', '5441': 'Groceries', '5451': 'Groceries', '5462': 'Groceries', '5499': 'Groceries',
  '5812': 'Eating out', '5813': 'Eating out', '5814': 'Eating out',
  '5921': 'Alcohol & tobacco', '5993': 'Alcohol & tobacco',
  // Fuel, transport and travel
  '5541': 'Transport', '5542': 'Transport', '4121': 'Transport', '4131': 'Transport', '7523': 'Transport', '7512': 'Transport', '7513': 'Transport',
  '4111': 'Transport', '4112': 'Transport', '4784': 'Transport',
  '4511': 'Travel', '4411': 'Travel', '7011': 'Travel', '7012': 'Travel', '4722': 'Travel',
  // Utilities, telecom and housing
  '4900': 'Utilities', '4899': 'Utilities', '4814': 'Utilities', '4816': 'Software & apps',
  '6513': 'Housing',
  // Health
  '8011': 'Health', '8021': 'Health', '8031': 'Health', '8041': 'Health', '8042': 'Health', '8043': 'Health', '8049': 'Health', '8050': 'Health', '8062': 'Health', '8071': 'Health', '8099': 'Health', '5912': 'Health', '5122': 'Health',
  // Insurance
  '6300': 'Insurance',
  // Government, tax and education
  '9311': 'Government & tax', '9399': 'Government & tax', '9222': 'Government & tax', '9402': 'Government & tax',
  '8211': 'Childcare & education', '8220': 'Childcare & education', '8241': 'Childcare & education', '8244': 'Childcare & education', '8299': 'Childcare & education',
  // Retail, home and shopping
  '5200': 'Home & garden', '5211': 'Home & garden', '5231': 'Home & garden', '5251': 'Home & garden', '5261': 'Home & garden', '5712': 'Home & garden', '5719': 'Home & garden',
  '5300': 'Shopping', '5310': 'Shopping', '5311': 'Shopping', '5331': 'Shopping', '5399': 'Shopping', '5964': 'Shopping', '5965': 'Shopping', '5966': 'Shopping', '5969': 'Shopping',
  '5045': 'Electronics', '5732': 'Electronics', '5734': 'Software & apps', '4813': 'Utilities',
  '5611': 'Clothing & accessories', '5621': 'Clothing & accessories', '5631': 'Clothing & accessories', '5641': 'Clothing & accessories', '5651': 'Clothing & accessories', '5661': 'Clothing & accessories', '5691': 'Clothing & accessories', '5698': 'Clothing & accessories', '5699': 'Clothing & accessories',
  '5977': 'Personal care', '7230': 'Personal care', '7297': 'Personal care', '7298': 'Personal care',
  '5192': 'Hobbies & media', '5942': 'Hobbies & media', '5735': 'Hobbies & media', '5945': 'Hobbies & media', '5946': 'Hobbies & media', '5947': 'Hobbies & media', '7829': 'Hobbies & media', '7832': 'Hobbies & media', '7841': 'Hobbies & media', '7922': 'Hobbies & media', '7996': 'Entertainment', '7997': 'Fitness & wellbeing', '7998': 'Entertainment', '7999': 'Entertainment', '7995': 'Entertainment',
  '5941': 'Fitness & wellbeing', '7911': 'Fitness & wellbeing',
  '5995': 'Pets', '0742': 'Pets',
  // Money movement, fees and services
  '6011': 'Cash withdrawal', '6012': 'Bank fees', '6051': 'Cash withdrawal', '4829': 'Bank fees',
  '8111': 'Professional services', '8931': 'Professional services', '7392': 'Professional services', '7399': 'Professional services',
  '8398': 'Gifts & donations', '8641': 'Gifts & donations', '8661': 'Gifts & donations',
};

/**
 * BRAND AND WORDING PATTERNS A BANK'S OWN DESCRIPTION LINE ACTUALLY CARRIES.
 *
 * Eleven categories meant almost nothing outside groceries and salary was ever recognised, so a
 * household's ledger filled up with Uncategorised the moment it left the supermarket. This is not one
 * ledger's transactions; it is the shape of what a daily statement in Australia says, generalised the
 * way a written taxonomy of common merchants would be for anyone's transactions rather than one person's
 * — supermarkets, fuel brands, fast food, streaming, telcos, insurers, government payments, ride-share,
 * the ordinary run of a household's spending. Checked top to bottom; the first that matches wins, so a
 * more specific brand is listed ahead of a broader word that might otherwise catch it first.
 *
 * What this deliberately does NOT do: guess who a person is. A bank transfer or Osko payment naming a
 * person rather than a business carries no signal about what it was for, and forcing a category onto it
 * would be inventing a fact the wording never stated — the same rule that keeps a misread bank
 * notification from becoming a purchase that never happened. It is left for the person to say, and
 * nothing here pretends otherwise.
 */
const HINTS: readonly (readonly [RegExp, string])[] = [
  // Groceries
  [/\b(?:WOOLWORTHS|WOOLIES|COLES|ALDI|IGA|FOODWORKS|FOODLAND|SUPA\s?IGA|SUPERMARKET|FRESH\s?FOOD)\b/, 'Groceries'],
  // Fast food and cafes, ahead of the generic "cafe/restaurant" catch-all
  [/\b(?:MCDONALD|MC\s?DONALD|HUNGRY\s?JACK|KFC|DOMINO|PIZZA\s?HUT|SUBWAY|GRILL\s?D|GUZMAN|NANDO|OPORTO|RED\s?ROOSTER|ZAMBRERO|MAD\s?MEX|BOOST\s?JUICE|GYG|SUSHI\s?(?:TRAIN|SUSHI)|CHARCOAL\s?CHICKEN)\b/, 'Eating out'],
  [/\b(?:STARBUCKS|GLORIA\s?JEAN|COFFEE|ESPRESSO|BAKERY|BAKEHOUSE|PATISSERIE|DONUT)\b/, 'Coffee & snacks'],
  // "Cafe", "restaurant" and the like are deliberately left out: real statements do use them bare, but
  // a household ledger, this app's own tests among them, uses exactly those words as a stand-in for "an
  // ordinary purchase, nothing more specific to say" far too often for a plain dictionary word to be a
  // safe signal. A named chain or a food-delivery service is a real claim; "cafe" on its own is a guess
  // dressed as one.
  [/\b(?:UBER\s?EATS|UBEREATS|DELIVEROO|MENULOG|DOORDASH)\b/, 'Eating out'],
  [/\b(?:DAN\s?MURPHY|BWS|LIQUORLAND|FIRST\s?CHOICE\s?LIQUOR|VINTAGE\s?CELLARS|BOTTLE\s?SHOP|LIQUOR)\b/, 'Alcohol & tobacco'],
  // Fuel, transport, tolls and travel
  // Same reasoning as "cafe": a bare "fuel" or "service station" is too generic a phrase to trust, and
  // it is exactly the kind of placeholder wording a fixture reaches for. A named fuel brand is a claim
  // this app can stand behind; "fuel" on its own is not.
  [/\b(?:BP|SHELL|CALTEX|AMPOL|MOBIL|UNITED\s?PETROLEUM|7\s?ELEVEN|LIBERTY\s?FUEL|EG\s?FUEL)\b/, 'Transport'],
  [/\b(?:LINKT|CITYLINK|EASTLINK|WESTCONNEX|GO\s?VIA|MYKI|OPAL\s?CARD|TOLL)\b/, 'Transport'],
  [/\b(?:UBER(?!\s?EATS)|DIDI|OLA|TAXI|CABCHARGE|SECURE\s?PARKING|WILSON\s?PARKING|PARKING)\b/, 'Transport'],
  [/\b(?:AIRBNB|BOOKING\s?COM|EXPEDIA|WOTIF|HOTELS\s?COM|AGODA|TRIVAGO|STAYZ)\b/, 'Travel'],
  [/\b(?:QANTAS|JETSTAR|VIRGIN\s?AUSTRALIA|SCOOT|FLYSCOOT|AIRASIA|SINGAPORE\s?AIRLINES|EMIRATES|REX\s?AIRLINES)\b/, 'Travel'],
  // Shopping and department stores
  [/\b(?:KMART|TARGET|BIG\s?W|MYER|DAVID\s?JONES|OFFICEWORKS)\b/, 'Shopping'],
  [/\b(?:JB\s?HI\s?FI|HARVEY\s?NORMAN|THE\s?GOOD\s?GUYS|APPLE\s?STORE)\b/, 'Electronics'],
  [/\b(?:COTTON\s?ON|ZARA|UNIQLO|SPORTSGIRL|GLUE\s?STORE|REBEL|RIVERS|BEST\s?LESS|CATCH\s?COM)\b/, 'Clothing & accessories'],
  [/\b(?:BUNNINGS|MITRE\s?10|IKEA|SPOTLIGHT|FANTASTIC\s?FURNITURE|FREEDOM\s?FURNITURE)\b/, 'Home & garden'],
  [/\b(?:PETBARN|PET\s?CIRCLE|PETSTOCK|VET\s?CLINIC|VETERINARY)\b/, 'Pets'],
  // Health, fitness and personal care
  [/\b(?:CHEMIST\s?WAREHOUSE|PRICELINE|TERRY\s?WHITE|PHARMACY|CHEMIST)\b/, 'Health'],
  [/\b(?:MEDICAL\s?CENTRE|MEDICAL\s?CLINIC|DENTAL|DENTIST|OPTOMETRIST|OPSM|SPECSAVERS|PATHOLOGY|PHYSIO)\b/, 'Health'],
  [/\b(?:BUPA|MEDIBANK|HCF|NIB\s?HEALTH|AHM|GMHBA)\b/, 'Insurance'],
  [/\b(?:FITNESS\s?FIRST|ANYTIME\s?FITNESS|F45|GOODLIFE|JETTS|PLANET\s?FITNESS|YOGA|PILATES)\b/, 'Fitness & wellbeing'],
  [/\b(?:MECCA|SEPHORA|HAIRDRESSER|BARBER|NAIL\s?(?:SALON|BAR)|BEAUTY\s?SALON|DAY\s?SPA)\b/, 'Personal care'],
  // Entertainment, subscriptions and software
  [/\b(?:NETFLIX|STAN|DISNEY|SPOTIFY|APPLE\s?MUSIC|AMAZON\s?PRIME|AMZNPRIME\w*|BINGE|KAYO|PARAMOUNT|YOUTUBE\s?PREMIUM|VIU|HBO\s?MAX)\b/, 'Subscriptions'],
  [/\b(?:STEAM|PLAYSTATION|XBOX|NINTENDO|RIOT\s?GAMES|EPIC\s?GAMES|TWITCH)\b/, 'Entertainment'],
  [/\b(?:CINEMA|HOYTS|VILLAGE\s?CINEMA|EVENT\s?CINEMA|TICKETEK|TICKETMASTER)\b/, 'Entertainment'],
  [/\b(?:OPENAI|CHATGPT|ANTHROPIC|CLAUDE\s?AI|MICROSOFT|ADOBE|DROPBOX|ICLOUD|GOOGLE\s?(?:ONE|PLAY|STORAGE)|CANVA|NOTION|GITHUB|ZOOM|ASPIEGEL\w*|TRADINGVIEW\w*)\b/, 'Software & apps'],
  // Utilities, insurance, government and telecom
  [/\b(?:AGL|ORIGIN\s?ENERGY|ENERGY\s?AUSTRALIA|RED\s?ENERGY|ALINTA|SIMPLY\s?ENERGY|POWERSHOP)\b/, 'Utilities'],
  [/\b(?:TELSTRA|OPTUS|VODAFONE|TPG|BELONG|AUSSIE\s?BROADBAND|IINET|DODO|AMAYSIM)\b/, 'Utilities'],
  [/\b(?:SA\s?WATER|YARRA\s?VALLEY\s?WATER|SYDNEY\s?WATER|WATER\s?CORPORATION)\b/, 'Utilities'],
  [/\b(?:NRMA|AAMI|ALLIANZ|QBE|SUNCORP|YOUI|BUDGET\s?DIRECT|COMPARE\s?THE\s?MARKET|GIO\s?INSURANCE)\b/, 'Insurance'],
  [/\b(?:ATO\b|AUSTRALIAN\s?TAXATION|CENTRELINK|SERVICES\s?AUSTRALIA|MEDICARE|VICROADS|COUNCIL\s?RATES)\b/, 'Government & tax'],
  // Money movement, fees and investing
  [/\b(?:WORLD\s?REMIT|WESTERN\s?UNION|REMITLY|MONEYGRAM|XOOM)\b/, 'Family & friends'],
  [/\b(?:WITHDRAWAL\s?AT|\bATM\b|HANDYBANK|BBLSATM|CASH\s?OUT)\b/, 'Cash withdrawal'],
  [/\b(?:ACCOUNT\s?FEE|MONTHLY\s?FEE|SERVICE\s?FEE|DISHONOUR|LATE\s?FEE|OVERDRAWN|INTEREST\s?CHARG(?:ED|E))\b/, 'Bank fees'],
  [/\b(?:COMMSEC|SELFWEALTH|STAKE\s?COM|SUPERHERO|BINANCE|COINSPOT|COINBASE|CRYPTO|SUPER\s?CONTRIBUTION|SUPERANNUATION)\b/, 'Investing'],
  [/\b(?:RED\s?CROSS|UNICEF|WORLD\s?VISION|SALVATION\s?ARMY|GOFUNDME|DONATION|CHARITY)\b/, 'Gifts & donations'],
];

/**
 * The wording that says money arrived rather than left, split by where it plausibly came from.
 * Salary is the strongest signal by far, so it stays checked first and on its own.
 */
const INCOME_HINTS: readonly (readonly [RegExp, string])[] = [
  [/\b(?:SALARY|PAYROLL|WAGES|PAY\s?DAY)\b/, 'Salary'],
  [/\b(?:CENTRELINK|CHILD\s?SUPPORT\s?RECEIVED|ATO\s?REFUND|TAX\s?REFUND)\b/, 'Government payment'],
  [/\b(?:INTEREST\s?PAID|INTEREST\s?CREDIT|DIVIDEND)\b/, 'Interest & investment income'],
];

export type CategorySource = 'rule' | 'default' | 'ai' | 'mcc' | 'hint' | 'none';
// Rules sorted and keyed once per list, not once per row.
const ruleIndex = new WeakMap<readonly CategoryRule[], Map<string, CategoryRule>>();
function ruleFor(rules: readonly CategoryRule[], merchant: string): CategoryRule | undefined {
  let index = ruleIndex.get(rules);
  if (!index) {
    index = new Map();
    for (const rule of [...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))) { const key = merchantName(rule.merchant); if (!index.has(key)) index.set(key, rule); }
    ruleIndex.set(rules, index);
  }
  return index.get(merchant);
}

/** Strongest first: owner rule, confirmed default, Claude's category, MCC, description hint. An owner's own tag is applied by the caller and beats all of these. */
export function categorize(row: NormalizedRow, rules: readonly CategoryRule[], defaults: Readonly<Record<string, string>> = {}, mcc: string | null = null, ai: Readonly<Record<string, string>> = {}): { category: string | null; confidence: number; reason: string; source: CategorySource } {
  const rule = ruleFor(rules, row.merchant);
  if (rule) return { category: rule.category, confidence: 10000, reason: 'Your merchant rule', source: 'rule' };
  if (Object.hasOwn(defaults, row.merchant)) return { category: defaults[row.merchant]!, confidence: 9500, reason: 'Confirmed merchant default', source: 'default' };
  if (Object.hasOwn(ai, row.merchant)) return { category: ai[row.merchant]!, confidence: 9300, reason: 'Sorted by Kairos AI', source: 'ai' };
  if (mcc && mccCategories[mcc]) return { category: mccCategories[mcc]!, confidence: 9200, reason: `Merchant category code ${mcc}`, source: 'mcc' };
  // Money arriving is checked against the income wording first — SALARY means something different in
  // "SALARY PAYMENT" than it would in a description of something bought — and falls through to the same
  // brand list a purchase would, since a refund from a shop still names the shop.
  const incoming = BigInt(row.minor) > 0n;
  const found = (incoming ? [...INCOME_HINTS, ...HINTS] : HINTS).find(([test]) => test.test(row.merchant));
  return found
    ? { category: found[1], confidence: 7000, reason: 'Suggested from description; confirm before applying', source: 'hint' }
    : { category: null, confidence: 0, reason: 'Uncategorised; choose a category', source: 'none' };
}

/** The owner's merchant rules, as categorize() reads them. */
export async function ownerRules(driver: Driver): Promise<CategoryRule[]> {
  const rows = await driver.query("SELECT id,priority,matcher,action FROM rules WHERE created_by='user' ORDER BY priority,id");
  return rows.flatMap(row => { const match: unknown = JSON.parse(String(row.matcher)), action: unknown = JSON.parse(String(row.action)); if (match && action && typeof match === 'object' && typeof action === 'object' && 'merchant' in match && 'category' in action && typeof match.merchant === 'string' && typeof action.category === 'string') return [{ id: String(row.id), priority: Number(row.priority), merchant: match.merchant, category: action.category }]; return []; });
}
/** Categories the owner confirmed as a merchant's default. */
export async function merchantDefaults(driver: Driver): Promise<Record<string, string>> {
  return Object.fromEntries((await driver.query('SELECT m.canonical_name,c.name FROM merchants m JOIN categories c ON c.id=m.default_category_id')).map(r => [String(r.canonical_name), String(r.name)]));
}

/** "All from this merchant": an owner rule, so it beats Claude and survives every rebuild. */
export function merchantRuleRepository(driver: Driver, refresh: () => Promise<void>) {
  async function set(merchant: string, category: string) {
    const {editableCategories} = await import('./categories');
    if (!editableCategories.includes(category)) throw new Error('Choose a supported category.');
    return driver.transaction(async () => {
      if (!(await driver.query('SELECT 1 FROM merchants WHERE canonical_name=?', [merchant])).length) throw new Error('That merchant is not in your ledger.');
      await driver.execute('INSERT OR REPLACE INTO rules(id,priority,matcher,action,created_by) VALUES(?,0,?,?,?)',
        ['merchant-rule:' + merchant, JSON.stringify({merchant}), JSON.stringify({category}), 'user']);
      await refresh();
    });
  }
  return {set};
}
