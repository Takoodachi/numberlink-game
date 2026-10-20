// generate_words.js
// Usage: node generate_words.js
// Keeps the existing levels in word_levels.enc, appends new Connecting Letters levels up to TARGET_TOTAL,
// and writes word_levels.enc (base64-encoded JSON array). Words and definitions come from words.txt.

const fs = require('fs');

const TARGET_TOTAL = 200;

// Difficulty ramp for the appended levels: [up to level id, grid size, min word length, max word length]
const SCHEDULE = [
    [80,  5, 8, 9],
    [110, 5, 9, 10],
    [150, 6, 10, 11],
    [200, 6, 11, 13],
];

// Skip words whose definitions mark them as offensive, slang or obscure
const EXCLUDE_DEF = /offens|derog|coarse|vulgar|slang|archaic|obsolete|\bhist\.|\bjoc\.|\bdial\./i;
const PART_OF_SPEECH = /^—?(n|v|adj|adv)\./;
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// English letter frequencies, used to pick filler letters
const LETTER_FREQ = 'EEEEEEEEEEEETTTTTTTTTAAAAAAAAOOOOOOOOIIIIIIINNNNNNNSSSSSSHHHHHHRRRRRRDDDDLLLLCCCMMMUUUWWFFGGYYPPBBVKJXQZ';

function randInt(n) { return Math.floor(Math.random() * n); }

// words.txt mixes UTF-8 and Windows-1252 entries, so decode each entry on its own
function readDictionary(path) {
    const raw = fs.readFileSync(path).toString('latin1').replace(/\r\n/g, '\n');
    const utf8 = new TextDecoder('utf-8', { fatal: true });
    const cp1252 = new TextDecoder('windows-1252');
    const dict = new Map();
    for (const chunk of raw.split(/\n\s*\n/)) {
        const bytes = Buffer.from(chunk.trim(), 'latin1');
        if (!bytes.length) continue;
        let text;
        try { text = utf8.decode(bytes); } catch { text = cp1252.decode(bytes); }
        const m = text.match(/^([A-Za-z]+)\d?\s{2,}([\s\S]+)$/);
        if (!m) continue;
        const word = m[1].toUpperCase();
        const def = m[2].replace(/\s+/g, ' ').trim();
        // Homographs (Angle1, Angle2): keep the first entry
        if (!dict.has(word)) dict.set(word, def);
    }
    return dict;
}

function decodeLevels(path) {
    if (!fs.existsSync(path)) return [];
    return JSON.parse(Buffer.from(fs.readFileSync(path, 'utf8').replace(/\s+/g, ''), 'base64').toString('utf8'));
}

// Rough commonness: how often a word appears inside other definitions
function usageCounts(dict) {
    const counts = new Map();
    for (const def of dict.values()) {
        for (const token of def.toUpperCase().match(/[A-Z]+/g) || []) {
            counts.set(token, (counts.get(token) || 0) + 1);
        }
    }
    return counts;
}

// Random self-avoiding orthogonal path of `len` cells
function randomPath(size, len) {
    for (let attempt = 0; attempt < 200; attempt++) {
        const path = [[randInt(size), randInt(size)]];
        const used = new Set([path[0].join(',')]);
        const grow = () => {
            if (path.length === len) return true;
            const [r, c] = path[path.length - 1];
            const options = DIRS.map(([dr, dc]) => [r + dr, c + dc])
                .filter(([nr, nc]) => nr >= 0 && nr < size && nc >= 0 && nc < size && !used.has(`${nr},${nc}`))
                .sort(() => Math.random() - 0.5);
            for (const next of options) {
                path.push(next);
                used.add(next.join(','));
                if (grow()) return true;
                used.delete(next.join(','));
                path.pop();
            }
            return false;
        };
        if (grow()) return path;
    }
    return null;
}

// Every dictionary word spelled by a simple path from start that ends exactly on end
function findWordsBetween(grid, size, start, end, words, prefixes, maxLen) {
    const found = new Set();
    const used = new Set();
    const walk = (r, c, s) => {
        if (!prefixes.has(s)) return;
        if (r === end[0] && c === end[1]) {
            if (words.has(s)) found.add(s);
            return; // the end node finishes the line
        }
        if (s.length >= maxLen) return;
        for (const [dr, dc] of DIRS) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= size || nc < 0 || nc >= size || used.has(nr * size + nc)) continue;
            used.add(nr * size + nc);
            walk(nr, nc, s + grid[nr * size + nc]);
            used.delete(nr * size + nc);
        }
    };
    used.add(start[0] * size + start[1]);
    walk(start[0], start[1], grid[start[0] * size + start[1]]);
    return found;
}

// Same search the game's hint uses (findWordSolutionPath): can `word` be traced from start to end?
function hasPath(level, word) {
    const { size, grid, startNode: s, endNode: e } = level;
    const used = new Set([s.r * size + s.c]);
    const dfs = (r, c, i) => {
        if (i === word.length - 1) return r === e.r && c === e.c;
        for (const [dr, dc] of DIRS) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= size || nc < 0 || nc >= size || used.has(nr * size + nc)) continue;
            if (grid[nr * size + nc] !== word[i + 1]) continue;
            used.add(nr * size + nc);
            if (dfs(nr, nc, i + 1)) return true;
            used.delete(nr * size + nc);
        }
        return false;
    };
    return grid[s.r * size + s.c] === word[0] && dfs(s.r, s.c, 0);
}

function buildLevel(id, size, word, dict, words, prefixes) {
    for (let attempt = 0; attempt < 60; attempt++) {
        const path = randomPath(size, word.length);
        if (!path) continue;
        const [start, end] = [path[0], path[path.length - 1]];
        // Endpoints too close make short shortcut words likely
        if (Math.abs(start[0] - end[0]) + Math.abs(start[1] - end[1]) < 3) continue;

        // Filler: half decoys from the word's own letters, half common English letters
        const grid = Array.from({ length: size * size }, () =>
            Math.random() < 0.5 ? word[randInt(word.length)] : LETTER_FREQ[randInt(LETTER_FREQ.length)]);
        path.forEach(([r, c], k) => { grid[r * size + c] = word[k]; });

        const found = findWordsBetween(grid, size, start, end, words, prefixes, 16);
        found.add(word);
        // Reject boards where a much shorter word also connects the endpoints
        if ([...found].some(w => w.length < word.length - 2)) continue;

        const validWords = [word, ...[...found].filter(w => w !== word).sort()];
        return {
            id, size, grid,
            startNode: { r: start[0], c: start[1] },
            endNode: { r: end[0], c: end[1] },
            validWords,
            wordDefinitions: Object.fromEntries(validWords.map(w => [w, dict.get(w)])),
        };
    }
    return null;
}

// Main

const dict = readDictionary('words.txt');
const counts = usageCounts(dict);
const existing = decodeLevels('word_levels.enc');
const usedWords = new Set(existing.flatMap(l => l.validWords));

// Any clean dictionary word may count as an alternative answer
const words = new Set([...dict].filter(([w, d]) => w.length >= 3 && !EXCLUDE_DEF.test(d)).map(([w]) => w));
const prefixes = new Set();
for (const w of words) for (let k = 1; k <= w.length; k++) prefixes.add(w.slice(0, k));

// Target words: nouns, verbs, adjectives, adverbs, most common first
const candidates = [...dict]
    .filter(([w, d]) => words.has(w) && PART_OF_SPEECH.test(d) && !usedWords.has(w))
    .map(([w]) => w)
    .sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0));

console.log(`Dictionary: ${dict.size} entries, ${candidates.length} candidate words. Existing levels: ${existing.length}`);

const levels = existing.slice();
for (let id = existing.length + 1; id <= TARGET_TOTAL; id++) {
    const [, size, minLen, maxLen] = SCHEDULE.find(([upTo]) => id <= upTo);
    // Early levels draw from the most common words, later ones from a wider pool
    const poolSize = 400 + Math.round(((id - existing.length) / (TARGET_TOTAL - existing.length)) * 1600);
    const pool = candidates.filter(w => w.length >= minLen && w.length <= maxLen && !usedWords.has(w)).slice(0, poolSize);
    let level = null;
    while (!level && pool.length) {
        const word = pool.splice(randInt(pool.length), 1)[0];
        level = buildLevel(id, size, word, dict, words, prefixes);
        if (level) level.validWords.forEach(w => usedWords.add(w));
    }
    if (!level) throw new Error(`Could not build level ${id}`);
    levels.push(level);
    console.log(`  Level ${id} (${size}x${size}): ${level.validWords.join(', ')}`);
}

// Self-check: every level is well-formed and every listed word can actually be traced; abort before writing if not
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };
for (const l of levels) {
    check(l.grid.length === l.size * l.size, `level ${l.id}: grid size`);
    check(l.grid.every(ch => /^[A-Z]$/.test(ch)), `level ${l.id}: letters`);
    for (const w of l.validWords) {
        check(hasPath(l, w), `level ${l.id}: no path for ${w}`);
        check(typeof l.wordDefinitions[w] === 'string' && l.wordDefinitions[w].length > 0, `level ${l.id}: no definition for ${w}`);
    }
}
check(levels.every((l, k) => l.id === k + 1), 'ids must run 1..N in order');
if (problems.length) throw new Error(`Self-check failed:\n${problems.join('\n')}`);

const encoded = Buffer.from(JSON.stringify(levels)).toString('base64');
fs.writeFileSync('word_levels.enc', encoded);
console.log(`\nWrote word_levels.enc (${levels.length} levels, ${encoded.length} bytes)`);
