import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

// 3D lobby: a night street of neon arcade cabinets, one per mode.
// Rendering only; Game owns the focused index, input and the info card.

const SPACING = 7;   // distance between cabinets along the street
const CAB_X = 1.7;   // cabinets stand this far off the street center
const TILT = 0.35;   // cabinets turn this much (radians) toward the street
const BG = '#05060e';

// Even-index cabinets stand on the right of the street (Game puts the card on the left)
const sideOf = (i) => (i % 2 === 0 ? 1 : -1);
const lerp = THREE.MathUtils.lerp;

export async function createLobbyScene(canvas, modes) {
    // Marquees are drawn in Orbitron; wait so they don't bake in a fallback font
    await document.fonts.load('900 48px Orbitron').catch(() => {});

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.Fog(BG, 9, 36);
    scene.add(new THREE.HemisphereLight(0x8a96ff, 0x05060e, 1.2));

    const grid = new THREE.GridHelper(160, 160, 0x2b3675, 0x151a38);
    grid.position.z = -SPACING * 2.5;
    scene.add(grid);

    addSkyline(scene);

    const glowTex = canvasTexture(128, 128, (ctx, w) => {
        const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        g.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, w);
    });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x141a33, roughness: 0.55, metalness: 0.35 });
    modes.forEach((m, i) => scene.add(makeCabinet(m, i, bodyMat, glowTex)));

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    let pos = 0, target = 0, zoom = 0, zoomTarget = 0, raf = 0, last = 0;

    // Camera pose for a fractional cabinet index t; zoom 1 = up against the focused screen
    function pose(t, time) {
        const i0 = Math.floor(t), i1 = Math.min(i0 + 1, modes.length - 1);
        const x = lerp(sideOf(i0), sideOf(i1), t - i0) * CAB_X;
        const z = -t * SPACING;
        // Wide screens keep the camera centered so the cabinet sits beside the card;
        // narrow screens frame the cabinet above the bottom card
        const narrow = camera.aspect < 0.9;
        const sway = Math.sin(time * 0.4) * 0.06;
        const cam = [narrow ? x * 0.9 + sway : sway, narrow ? 1.5 : 1.7, z + (narrow ? 6.4 : 5.4)];
        const look = [narrow ? x : 0, narrow ? 0.45 : 1.35, z];

        if (zoom > 0.001) {
            // Point straight at the screen face of the nearest cabinet
            const i = Math.round(t), s = sideOf(i), theta = -s * TILT;
            const nx = Math.sin(theta), nz = Math.cos(theta);
            const sx = s * CAB_X + nx * 0.5, sz = -i * SPACING + nz * 0.5;
            const zc = [sx + nx * 1.6, 1.5, sz + nz * 1.6];
            const zl = [sx, 1.5, sz];
            for (let k = 0; k < 3; k++) {
                cam[k] = lerp(cam[k], zc[k], zoom);
                look[k] = lerp(look[k], zl[k], zoom);
            }
        }
        camera.position.set(cam[0], cam[1], cam[2]);
        camera.lookAt(look[0], look[1], look[2]);
    }

    function frame(now) {
        raf = requestAnimationFrame(frame);
        const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
        last = now;
        pos += (target - pos) * (1 - Math.exp(-dt * 4.5));
        zoom += (zoomTarget - zoom) * (1 - Math.exp(-dt * 6));
        pose(pos, now / 1000);
        renderer.render(scene, camera);
    }

    function resize() {
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    return {
        goTo(i, instant = false) {
            target = i;
            zoomTarget = 0;
            if (instant) { pos = i; zoom = 0; }
        },
        zoomIn() { zoomTarget = 1; },
        start() {
            if (raf) return;
            last = 0;
            resize();
            raf = requestAnimationFrame(frame);
        },
        stop() {
            cancelAnimationFrame(raf);
            raf = 0;
        },
    };
}

function makeCabinet(m, i, bodyMat, glowTex) {
    const accent = new THREE.Color(m.accent);
    const side = sideOf(i);
    const cab = new THREE.Group();
    cab.position.set(side * CAB_X, 0, -i * SPACING);
    cab.rotation.y = -side * TILT;

    const bodyGeo = new THREE.BoxGeometry(1.4, 2.3, 1.0);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.15;

    const trim = new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeo), new THREE.LineBasicMaterial({ color: accent }));
    trim.position.y = 1.15;

    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.45), bodyMat);
    panel.position.set(0, 0.88, 0.68);
    panel.rotation.x = 0.25;

    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1, 1.1),
        new THREE.MeshBasicMaterial({ map: canvasTexture(256, 256, (ctx, s) => paintBoard(ctx, s, m)) })
    );
    screen.position.set(0, 1.5, 0.505);

    const marquee = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 0.4),
        new THREE.MeshBasicMaterial({
            map: canvasTexture(512, 128, (ctx, w, h) => paintMarquee(ctx, w, h, m)),
            transparent: true,
            depthWrite: false,
        })
    );
    marquee.position.set(0, 2.62, 0.1);

    const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(4.5, 4.5),
        new THREE.MeshBasicMaterial({
            map: glowTex, color: accent, transparent: true, opacity: 0.55,
            blending: THREE.AdditiveBlending, depthWrite: false,
        })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, 0.01, 0.8);

    const light = new THREE.PointLight(accent, 6, 6);
    light.position.set(0, 1.6, 1.4);

    cab.add(body, trim, panel, screen, marquee, glow, light);
    return cab;
}

// Cabinet screen: the same static preview board as the flat lobby card
function paintBoard(ctx, s, m) {
    const b = m.board, n = 5, pad = s * 0.08, cell = (s - pad * 2) / n;
    const at = (v) => pad + (v + 0.5) * cell;

    ctx.fillStyle = '#0d1022';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(233, 236, 248, 0.12)';
    ctx.lineWidth = 2;
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) ctx.strokeRect(pad + c * cell + 2, pad + r * cell + 2, cell - 4, cell - 4);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${cell * 0.5}px Outfit, sans-serif`;
    ctx.fillStyle = 'rgba(233, 236, 248, 0.8)';
    (b.letters || []).forEach(([r, c, l]) => ctx.fillText(l, at(c), at(r)));
    (b.tps || []).forEach(([r, c, glyph, color]) => {
        ctx.fillStyle = color;
        ctx.fillText(glyph, at(c), at(r));
    });
    b.nodes.forEach(({ r, c, cl }) => {
        ctx.fillStyle = cl;
        ctx.beginPath();
        ctx.arc(at(c), at(r), cell * 0.34, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = cell * 0.09;
    ctx.lineCap = 'round';
    (b.walls || []).forEach(([r, c, side]) => {
        const x = pad + (c + 1) * cell, y = pad + (r + 1) * cell;
        ctx.beginPath();
        if (side === 'r') { ctx.moveTo(x, y - cell); ctx.lineTo(x, y); }
        else { ctx.moveTo(x - cell, y); ctx.lineTo(x, y); }
        ctx.stroke();
    });

    if (b.fog) {
        const g = ctx.createLinearGradient(0, 0, s, s);
        g.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
        g.addColorStop(0.6, 'rgba(0, 0, 0, 0.1)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
    }

    // CRT scanlines and an accent bezel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    for (let y = 0; y < s; y += 4) ctx.fillRect(0, y, s, 1);
    ctx.strokeStyle = m.accent;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, s - 6, s - 6);
}

// Neon sign above the cabinet
function paintMarquee(ctx, w, h, m) {
    const text = m.name.toUpperCase();
    let size = h * 0.46;
    do {
        ctx.font = `900 ${size}px Orbitron, sans-serif`;
        size -= 2;
    } while (ctx.measureText(text).width > w * 0.9 && size > 12);

    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, m.accent);
    g.addColorStop(1, m.accent2);
    ctx.fillStyle = g;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = m.accent;
    ctx.shadowBlur = h * 0.2;
    ctx.fillText(text, w / 2, h / 2);
}

// Dark towers with lit windows on both sides of the street
function addSkyline(scene) {
    const tints = ['#ffd9a0', '#9fc4ff', '#ff9ad5'];
    const windows = canvasTexture(128, 256, (ctx, w, h) => {
        ctx.fillStyle = '#06070f';
        ctx.fillRect(0, 0, w, h);
        for (let y = 8; y < h - 8; y += 10) {
            for (let x = 6; x < w - 8; x += 12) {
                if (Math.random() > 0.3) continue;
                ctx.globalAlpha = 0.35 + Math.random() * 0.6;
                ctx.fillStyle = tints[Math.floor(Math.random() * tints.length)];
                ctx.fillRect(x, y, 6, 5);
            }
        }
    });
    const mat = new THREE.MeshBasicMaterial({ map: windows });
    for (let i = 0; i < 30; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const w = 3 + Math.random() * 4, h = 6 + Math.random() * 18, d = 3 + Math.random() * 4;
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        tower.position.set(side * (8 + w / 2 + Math.random() * 5), h / 2, 8 - Math.floor(i / 2) * 3.6);
        scene.add(tower);
    }
}

function canvasTexture(w, h, paint) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}
