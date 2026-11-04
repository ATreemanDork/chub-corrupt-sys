/***
 Tolerant parser for the Corruption System card's model output.

 The card instructs the model to emit:
   - target profile blocks: **NAME:{...}** / **AGE:{##}** / **OCCUPATION:{##}** / **APPEARANCE: [[...]]**
   - a stat line at the end of every message: **LUST:{##}, CORRUPTION:{##}, DOMINANCE:{##}**
   - **FETISHES: [[...]]** (per 20 CORRUPTION) and **ABILITY POINTS:{##}** on completion.

 Model output is not a schema: key case drifts (the card itself uses OCCUPATION/Occupation
 and DOMINANCE/DOMINATION) and the {} / [[ ]] wrappers may drop, so we match on field
 names, case-insensitively, and take the LAST occurrence of each field in the message.
 ***/

export type CorruptionStats = {
    lust: number;
    corruption: number;
    dominance: number;
};

export type TargetProfile = {
    name: string;
    age?: number;
    occupation?: string;
    appearance?: string;
};

export type ParsedMessage = {
    target?: TargetProfile;
    stats?: CorruptionStats;
    fetishes?: string;
    points?: number;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Last occurrence of "<KEY>[:|-] <value-to-end-of-line>", case-insensitive.
 * Strips trailing bold markers, [[ ... ]] wrappers and { } wrappers.
 * Returns undefined when absent or empty.
 */
function lastField(content: string, key: string): string | undefined {
    // Global flag required: lastNumber/lastField walk all occurrences via exec().
    const re = new RegExp('\\b' + key + '\\s*[:\\-]\\s*([^\\n]*)', 'gi');
    let last: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) last = m;
    if (last == null) return undefined;
    let v = last[1].replace(/[\s*]+$/, '');
    const lb = v.indexOf('[[');
    if (lb !== -1) {
        const rb = v.lastIndexOf(']]');
        if (rb > lb) v = v.slice(lb + 2, rb);
    }
    v = v.replace(/^\{+/, '').replace(/\}+$/, '').trim();
    return v === '' ? undefined : v;
}

/** Last numeric match of a global regex; undefined when absent. */
function lastNumber(content: string, re: RegExp): number | undefined {
    let last: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) last = m;
    return last != null ? Number(last[1]) : undefined;
}

const LUST_RE = /\bLUST\s*[:-]\s*\{?(-?\d{1,3})\}?/gi;
const CORRUPTION_RE = /\bCORRUPTION\s*[:-]\s*\{?(\d{1,3})\}?/gi;
// The card uses both DOMINANCE (description) and DOMINATION (first message); models emit either.
const DOMINANCE_RE = /\b(?:DOMINANCE|DOMINATION)\s*[:-]\s*\{?(-?\d{1,3})\}?/gi;
const POINTS_RE = /\bABILITY\s+POINTS?\s*[:-]\s*\{?(-?\d+)\}?/gi;

/**
 * Parse one bot message. Stats are only reported when all three values are
 * present (the card's stat line always has all three; a partial line is drift).
 */
export function parseMessage(content: string): ParsedMessage {
    const out: ParsedMessage = {};
    const lust = lastNumber(content, LUST_RE);
    const corruption = lastNumber(content, CORRUPTION_RE);
    const dominance = lastNumber(content, DOMINANCE_RE);
    if (lust != null && corruption != null && dominance != null) {
        out.stats = {
            lust: clamp(lust, 0, 100),
            corruption: clamp(corruption, 0, 100),
            dominance: clamp(dominance, -100, 100),
        };
    }
    const name = lastField(content, 'NAME');
    if (name != null) {
        const target: TargetProfile = {name};
        const age = Number(lastField(content, 'AGE'));
        if (Number.isFinite(age) && age > 0) target.age = age;
        const occupation = lastField(content, 'OCCUPATION');
        if (occupation != null) target.occupation = occupation;
        const appearance = lastField(content, 'APPEARANCE');
        if (appearance != null) target.appearance = appearance;
        out.target = target;
    }
    const fetishes = lastField(content, 'FETISHES');
    if (fetishes != null) out.fetishes = fetishes;
    const points = lastNumber(content, POINTS_RE);
    if (points != null) out.points = points;
    return out;
}
