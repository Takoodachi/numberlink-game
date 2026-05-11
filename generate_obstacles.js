// generate_obstacles.js
// Usage: node generate_obstacles.js
// Outputs: obstacles.enc (base64-encoded JSON array of 50 levels)

const fs = require('fs');

// Helpers

function wallKey(r, c, side) { return `${r},${c},${side}`; }

function hasWall(wallSet, r, c, nr, nc) {
    const dr = nr - r, dc = nc - c;
    if (dr === 0 && dc === 1)  return wallSet.has(wallKey(r, c, 'right'));
    if (dr === 0 && dc === -1) return wallSet.has(wallKey(r, nc, 'right'));
    if (dr === 1 && dc === 0)  return wallSet.has(wallKey(r, c, 'bottom'));
    if (dr === -1 && dc === 0) return wallSet.has(wallKey(nr, c, 'bottom'));
    return false;
}

function isValidTPEntry(fromR, fromC, toR, toC, dir) {
    const dr = toR - fromR, dc = toC - fromC;
    if (dir === 'right') return dr === 0 && dc === 1;
    if (dir === 'left')  return dr === 0 && dc === -1;
    if (dir === 'down')  return dr === 1 && dc === 0;
    if (dir === 'up')    return dr === -1 && dc === 0;
    return false;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function cellKey(r, c) { return `${r},${c}`; }

// Hamiltonian Path (DFS + Warnsdorff heuristic)

function countNeighbors(r, c, size, visited, wallSet, tpMap) {
    let count = 0;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (visited.has(cellKey(nr, nc))) continue;
        if (hasWall(wallSet, r, c, nr, nc)) continue;
        const tp = tpMap[cellKey(nr, nc)];
        if (tp) {
            if (!isValidTPEntry(r, c, nr, nc, tp.dir)) continue;
            if (visited.has(cellKey(tp.partner.r, tp.partner.c))) continue;
        }
        count++;
    }
    return count;
}

function hamiltonianDFS(size, wallSet, tpMap, startR, startC, maxAttempts = 500000) {
    const total = size * size;
    const visited = new Set([cellKey(startR, startC)]);
    const path = [{ r: startR, c: startC }];
    let attempts = 0;

    function dfs(r, c) {
        if (++attempts > maxAttempts) return false;
        if (visited.size === total) return true;

        // Build neighbor candidates
        const neighbors = [];
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
            if (hasWall(wallSet, r, c, nr, nc)) continue;

            const tp = tpMap[cellKey(nr, nc)];
            if (tp) {
                // Must enter from correct direction
                if (!isValidTPEntry(r, c, nr, nc, tp.dir)) continue;
                // Partner must also be unvisited
                const pk = cellKey(tp.partner.r, tp.partner.c);
                if (visited.has(cellKey(nr, nc)) || visited.has(pk)) continue;
                // Warnsdorff: count from partner (where we'll actually continue)
                const tmpVisited = new Set(visited);
                tmpVisited.add(cellKey(nr, nc));
                tmpVisited.add(pk);
                const w = countNeighbors(tp.partner.r, tp.partner.c, size, tmpVisited, wallSet, tpMap);
                neighbors.push({ r: nr, c: nc, tp: tp, w });
            } else {
                if (visited.has(cellKey(nr, nc))) continue;
                const tmpVisited = new Set(visited);
                tmpVisited.add(cellKey(nr, nc));
                const w = countNeighbors(nr, nc, size, tmpVisited, wallSet, tpMap);
                neighbors.push({ r: nr, c: nc, tp: null, w });
            }
        }

        // Shuffle first so equal-weight ties are broken randomly, then sort
        shuffle(neighbors);
        neighbors.sort((a, b) => a.w - b.w);

        for (const next of neighbors) {
            if (next.tp) {
                const pk = cellKey(next.tp.partner.r, next.tp.partner.c);
                visited.add(cellKey(next.r, next.c));
                visited.add(pk);
                path.push({ r: next.r, c: next.c, isTPEntry: true });
                path.push({ r: next.tp.partner.r, c: next.tp.partner.c });
                if (dfs(next.tp.partner.r, next.tp.partner.c)) return true;
                path.pop(); path.pop();
                visited.delete(cellKey(next.r, next.c));
                visited.delete(pk);
            } else {
                visited.add(cellKey(next.r, next.c));
                path.push({ r: next.r, c: next.c });
                if (dfs(next.r, next.c)) return true;
                path.pop();
                visited.delete(cellKey(next.r, next.c));
            }
        }
        return false;
    }

    return dfs(startR, startC) ? path : null;
}

// Wall Placement

function buildPathEdgeSet(path) {
    const edges = new Set();
    for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i], b = path[i + 1];
        // Skip TP jumps (non-adjacent)
        if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) continue;
        const dr = b.r - a.r, dc = b.c - a.c;
        if (dc === 1)  edges.add(wallKey(a.r, a.c, 'right'));
        if (dc === -1) edges.add(wallKey(b.r, b.c, 'right'));
        if (dr === 1)  edges.add(wallKey(a.r, a.c, 'bottom'));
        if (dr === -1) edges.add(wallKey(b.r, b.c, 'bottom'));
    }
    return edges;
}

function buildTPEntryEdgeSet(teleporters) {
    // Edges that are the entry into a TP cell — must NOT be walled
    const protect = new Set();
    for (const tp of teleporters) {
        const { r, c, dir } = tp;
        if (dir === 'right')  protect.add(wallKey(r, c - 1, 'right'));
        if (dir === 'left')   protect.add(wallKey(r, c, 'right'));
        if (dir === 'down')   protect.add(wallKey(r - 1, c, 'bottom'));
        if (dir === 'up')     protect.add(wallKey(r, c, 'bottom'));
    }
    return protect;
}

function placeWalls(size, path, teleporters, numWalls, rng) {
    const pathEdges = buildPathEdgeSet(path);
    const tpProtect = buildTPEntryEdgeSet(teleporters);

    const candidates = [];
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (c + 1 < size) {
                const k = wallKey(r, c, 'right');
                if (!pathEdges.has(k) && !tpProtect.has(k)) candidates.push({ r, c, side: 'right' });
            }
            if (r + 1 < size) {
                const k = wallKey(r, c, 'bottom');
                if (!pathEdges.has(k) && !tpProtect.has(k)) candidates.push({ r, c, side: 'bottom' });
            }
        }
    }

    shuffle(candidates);
    return candidates.slice(0, Math.min(numWalls, candidates.length));
}

// Clue Extraction

function extractClues(path, numNodes, tpCellSet) {
    const n = path.length;
    const clues = [];
    for (let i = 0; i < numNodes; i++) {
        let idx = Math.round(i * (n - 1) / (numNodes - 1));
        // Slide forward, then backward if we've hit the boundary still on a TP cell
        while (idx < n - 1 && tpCellSet.has(cellKey(path[idx].r, path[idx].c))) idx++;
        while (idx > 0 && tpCellSet.has(cellKey(path[idx].r, path[idx].c))) idx--;
        clues.push({ r: path[idx].r, c: path[idx].c, val: i + 1 });
    }
    return clues;
}

// Teleporter Placement

const DIRS = ['right', 'left', 'up', 'down'];

function placeTeleporters(size, numPairs, clueSet) {
    const teleporters = [];
    const usedCells = new Set(clueSet);

    for (let p = 0; p < numPairs; p++) {
        // Try up to 50 placements per pair
        let placed = false;
        for (let attempt = 0; attempt < 50; attempt++) {
            const r1 = Math.floor(Math.random() * size);
            const c1 = Math.floor(Math.random() * size);
            const r2 = Math.floor(Math.random() * size);
            const c2 = Math.floor(Math.random() * size);
            const k1 = cellKey(r1, c1), k2 = cellKey(r2, c2);

            if (k1 === k2) continue;
            if (usedCells.has(k1) || usedCells.has(k2)) continue;
            // Must not be adjacent (to avoid confusion)
            if (Math.abs(r1 - r2) + Math.abs(c1 - c2) <= 1) continue;
            // Each TP needs at least one valid entry cell on the grid
            const dir = DIRS[Math.floor(Math.random() * DIRS.length)];
            if (!hasValidEntry(r1, c1, dir, size)) continue;
            if (!hasValidEntry(r2, c2, dir, size)) continue;

            usedCells.add(k1);
            usedCells.add(k2);
            teleporters.push({ pair: p, r: r1, c: c1, dir });
            teleporters.push({ pair: p, r: r2, c: c2, dir });
            placed = true;
            break;
        }
        if (!placed) return null; // Can't place this pair
    }
    return teleporters;
}

function hasValidEntry(r, c, dir, size) {
    if (dir === 'right') return c > 0; // entry from left
    if (dir === 'left')  return c < size - 1;
    if (dir === 'down')  return r > 0;
    if (dir === 'up')    return r < size - 1;
    return false;
}

// Level Generation

function buildTPMap(teleporters) {
    const tpMap = {};
    for (const tp of teleporters) {
        const partner = teleporters.find(t => t.pair === tp.pair && !(t.r === tp.r && t.c === tp.c));
        tpMap[cellKey(tp.r, tp.c)] = { dir: tp.dir, partner };
    }
    return tpMap;
}

function tryGenerateLevel(id, size, numWalls, numTelePairs, numNodes) {
    // Provisional clue set (just corners for TP placement avoidance)
    const clueSet = new Set();

    // Place teleporters first
    let teleporters = [];
    if (numTelePairs > 0) {
        teleporters = placeTeleporters(size, numTelePairs, clueSet);
        if (!teleporters) return null;
    }

    const tpMap = buildTPMap(teleporters);
    const emptyWallSet = new Set();

    // Find Hamiltonian path
    const startR = Math.floor(Math.random() * size);
    const startC = Math.floor(Math.random() * size);

    // Skip start if it's a TP cell
    if (tpMap[cellKey(startR, startC)]) return null;

    const path = hamiltonianDFS(size, emptyWallSet, tpMap, startR, startC);
    if (!path) return null;

    // Place walls
    const walls = placeWalls(size, path, teleporters, numWalls);

    // Verify the path still works with walls (re-check no wall on path edges)
    const wallSet = new Set(walls.map(w => wallKey(w.r, w.c, w.side)));
    for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i], b = path[i + 1];
        if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) continue; // TP jump
        if (hasWall(wallSet, a.r, a.c, b.r, b.c)) return null; // wall blocks path
    }

    // Extract clues (avoid placing a clue on a TP cell)
    const tpCellSet = new Set(teleporters.map(t => cellKey(t.r, t.c)));
    const clues = extractClues(path, numNodes, tpCellSet);

    // Clean path to just {r, c} (strip isTPEntry flag for storage)
    const cleanPath = path.map(p => ({ r: p.r, c: p.c }));

    return {
        id,
        size,
        clues,
        solution: cleanPath,
        walls: walls.map(w => ({ r: w.r, c: w.c, side: w.side })),
        teleporters: teleporters.map(t => ({ pair: t.pair, r: t.r, c: t.c, dir: t.dir }))
    };
}

function generateLevel(id, size, numWalls, numTelePairs, numNodes, maxRetries = 300) {
    for (let i = 0; i < maxRetries; i++) {
        const level = tryGenerateLevel(id, size, numWalls, numTelePairs, numNodes);
        if (level) return level;
    }
    console.warn(`Failed to generate level ${id} after ${maxRetries} retries, using fallback`);
    return generateFallback(id, size, numNodes);
}

function generateFallback(id, size, numNodes) {
    // Simple snake path fallback (no obstacles)
    const path = [];
    for (let r = 0; r < size; r++) {
        const cols = r % 2 === 0 ? Array.from({length: size}, (_, c) => c)
                                 : Array.from({length: size}, (_, c) => size - 1 - c);
        for (const c of cols) path.push({ r, c });
    }
    return {
        id,
        size,
        clues: extractClues(path, numNodes, new Set()),
        solution: path,
        walls: [],
        teleporters: []
    };
}

// Level Schedule
// [id, size, walls, tpPairs, numNodes]
// numNodes controls clue density: more = easier (more anchors), fewer = harder (more freedom)
// Guidelines by grid size:
//   4×4 (16 cells): dense=5, medium=4, sparse=3
//   5×5 (25 cells): dense=8, medium=5, sparse=3-4
//   6×6 (36 cells): dense=10, medium=7-8, sparse=5-6
//   7×7 (49 cells): dense=13, medium=10, sparse=7-8

const LEVEL_CONFIGS = [
    // 4×4 — walls only, gentle intro
    [1,  4, 1, 0, 5],   // 1 wall, dense clues (easy)
    [2,  4, 2, 0, 4],
    [3,  4, 4, 0, 4],
    [4,  4, 5, 0, 3],   // more walls, fewer clues
    [5,  4, 4, 0, 3],

    // 4×4 — introduce teleporters
    [6,  4, 0, 1, 5],   // no walls, 1 TP: pure teleporter intro
    [7,  4, 2, 1, 4],
    [8,  4, 3, 1, 4],
    [9,  4, 4, 1, 3],
    [10, 4, 5, 1, 3],

    // 5×5 — walls only, varying density
    [11, 5, 2, 0, 7],   // gentle 5×5 intro, dense clues
    [12, 5, 4, 0, 6],
    [13, 5, 6, 0, 5],
    [14, 5, 7, 0, 5],
    [15, 5, 9, 0, 4],   // wall-heavy, sparse

    // 5×5 — 1 teleporter pair
    [16, 5, 1, 1, 6],
    [17, 5, 3, 1, 5],
    [18, 5, 5, 1, 5],
    [19, 5, 8, 1, 4],
    [20, 5, 9, 1, 4],

    // 5×5 — 2 teleporter pairs (mid-challenge)
    [21, 5, 2, 2, 6],
    [22, 5, 4, 2, 5],
    [23, 5, 7, 2, 5],
    [24, 5, 8, 2, 4],
    [25, 5, 9, 2, 3],   // hardest 5×5: many walls, 2 TPs, sparse clues

    // 6×6 — introduce larger grid
    [26, 6, 3, 0, 10],  // walls only, dense: gentle 6×6 intro
    [27, 6, 5, 1, 9],
    [28, 6, 7, 1, 8],
    [29, 6, 5, 2, 8],
    [30, 6, 9, 1, 7],
    [31, 6, 7, 2, 7],
    [32, 6, 10, 2, 7],
    [33, 6, 6, 2, 6],   // sparse 6×6
    [34, 6, 11, 1, 6],  // wall-heavy, sparse
    [35, 6, 9, 2, 5],   // hardest 6×6

    // 7×7 — endgame
    [36, 7, 4, 1, 13],  // gentle intro to 7×7: few walls, 1 TP, dense
    [37, 7, 6, 2, 12],
    [38, 7, 8, 2, 11],
    [39, 7, 5, 2, 11],
    [40, 7, 10, 2, 10],
    [41, 7, 8, 2, 10],
    [42, 7, 11, 2, 9],
    [43, 7, 7, 2, 9],
    [44, 7, 12, 2, 8],
    [45, 7, 9, 2, 8],
    [46, 7, 10, 2, 8],
    [47, 7, 13, 2, 7],  // sparse starts
    [48, 7, 8, 2, 7],
    [49, 7, 12, 2, 7],
    [50, 7, 11, 2, 7],  // hardest: big grid, many walls, 2 TPs, sparse clues
];

// Main

console.log('Generating 50 Obstacles levels...');
const levels = [];

for (const [id, size, walls, tpPairs, numNodes] of LEVEL_CONFIGS) {
    process.stdout.write(`  Level ${id} (${size}×${size}, ${walls} walls, ${tpPairs} TP pairs, ${numNodes} clues)... `);
    const level = generateLevel(id, size, walls, tpPairs, numNodes);
    levels.push(level);
    console.log(`done (path len: ${level.solution.length}, walls: ${level.walls.length}, TPs: ${level.teleporters.length}, clues: ${level.clues.length})`);
}

const json = JSON.stringify(levels);
const encoded = Buffer.from(json).toString('base64');
fs.writeFileSync('obstacles.enc', encoded);
console.log(`\nWrote obstacles.enc (${levels.length} levels, ${encoded.length} bytes)`);
