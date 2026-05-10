import type { ParsedQuery, Period } from '../types.js';

const PERIOD_PATTERNS: Array<[RegExp, Period]> = [
  [/today|24\s*h|last\s*day/i, '1d'],
  [/this\s*week|7\s*days?|past\s*week|last\s*week/i, '7d'],
  [/this\s*month|30\s*days?|past\s*month|last\s*month/i, '30d'],
  [/3\s*months?|90\s*days?|quarter/i, '90d'],
];

const INTENT_PATTERNS: Array<[RegExp, ParsedQuery['intent']]> = [
  [/top\s*page|best\s*page|most\s*visit|trending\s*page|popular\s*page/i, 'top_pages'],
  [/referr|where.*from|traffic\s*source|came\s*from/i, 'referrers'],
  [/anomal|spike|drop|unusual|weird|strange/i, 'anomalies'],
  [/countr|cit[yi]|geo|location|where.*visit|region/i, 'geo'],
  [/device|mobile|desktop|tablet|browser|chrome|safari|firefox|os\b|operating/i, 'device'],
  [/active|right now|live|online|currently|who.*on/i, 'active'],
  [/how long|time on|session.*(time|duration)|avg.*time|average.*time|dwell/i, 'time'],
  [/event|click|button|form|submit|custom/i, 'events'],
  [/insight|summar|overview|how.*did|how.*doing|performance/i, 'insights'],
];

export function parseQuery(question: string): ParsedQuery {
  let period: Period = '7d';
  for (const [pattern, p] of PERIOD_PATTERNS) {
    if (pattern.test(question)) { period = p; break; }
  }

  let intent: ParsedQuery['intent'] = 'overview';
  for (const [pattern, i] of INTENT_PATTERNS) {
    if (pattern.test(question)) { intent = i; break; }
  }

  return { intent, period, originalQuestion: question };
}
