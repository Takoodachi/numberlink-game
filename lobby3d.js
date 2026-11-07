import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 3D lobby: a rainy neon street of arcade cabinets, one per mode.
// Rendering only; Game owns the focused index, input and the info card.

const SPACING = 7;   // distance between cabinets along the street
const CAB_X = 1.7;   // cabinets stand this far off the street center
const TILT = -0.22;  // cabinet yaw (radians); negative turns them slightly outward so the side profile shows
const CAB_W = 1.3;   // cabinet width
const BG = '#05060e';
// Side-art texture mapping (profile units -> texture); ART_FLIP mirrors it for the +x panel
const ART_REPEAT = 1 / 1.25, ART_OFFSET = 0.47 / 1.25;
const ART_FLIP = (1 - 2 * ART_OFFSET) / ART_REPEAT;
// Adaptive resolution limits and step
const MIN_RATIO = 0.6, RATIO_STEP = 0.15;

// Even-index cabinets stand on the right of the street (Game puts the card on the left)
const sideOf = (i) => (i % 2 === 0 ? 1 : -1);
const lerp = THREE.MathUtils.lerp;

// Per-mode cabinet: side-profile silhouette, control panel and animated topper.
// screenTop is the [z, y] of the screen's top edge; its bottom edge is fixed at [0.30, 1.06]
const STYLES = {
    classic:   { H: 2.35, jut: 0.20, screenTop: [0.16, 1.98], top: 'marquee', panel: 'joystick', topper: 'orbs' },
    speedrun:  { H: 2.2,  jut: 0.36, screenTop: [0.04, 1.88], top: 'slant',   panel: 'wheel',    topper: 'stopwatch' },
    blindfold: { H: 2.45, jut: 0.20, screenTop: [0.12, 1.96], top: 'visor',   panel: 'trackball', topper: 'eye' },
    optimal:   { H: 2.65, jut: 0.16, screenTop: [0.18, 2.00], top: 'peak',    panel: 'spinner',  topper: 'crystal' },
    obstacles: { H: 2.3,  jut: 0.26, screenTop: [0.14, 1.96], top: 'step',    panel: 'dpad',     topper: 'portals' },
    words:     { H: 2.4,  jut: 0.24, screenTop: [0.16, 1.98], top: 'arch',    panel: 'keyboard', topper: 'letters' },
};

// onPick(i) runs when a cabinet is clicked; onHover(bool) when the pointer moves onto or off one
export async function createLobbyScene(canvas, modes, { onPick, onHover } = {}) {
    // Signs and screens are drawn in Orbitron/Outfit; wait so they don't bake in a fallback font
    await Promise.all([
        document.fonts.load('900 48px Orbitron'),
        document.fonts.load('700 48px Outfit'),
    ]).catch(() => {});

    // Phones and low-core machines get less rain, fewer stars and a lower resolution
    const low = Math.min(window.innerWidth, window.innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4;

    // No antialias: the scene renders through the composer's own targets, so canvas MSAA only cost time
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    // Resolution starts at up to 1.25x (1x on low-power devices) and adapts to hold 60 FPS (see frame())
    const maxRatio = Math.min(window.devicePixelRatio || 1, low ? 1 : 1.25);
    let ratio = maxRatio;
    renderer.setPixelRatio(ratio);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.Fog(BG, 14, 64);
    scene.add(new THREE.HemisphereLight(0x8a96ff, 0x05060e, 1.0));
    const moonLight = new THREE.DirectionalLight(0x7f8cff, 0.9);
    moonLight.position.set(-6, 10, 4);
    scene.add(moonLight);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);

    // Bloom makes every bright surface (screens, neon, windows) glow
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // Bloom works at half resolution: it's a blur, so it looks the same for a quarter of the pixels
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.4, 0.62);
    const setBloomSize = bloom.setSize.bind(bloom);
    bloom.setSize = (w, h) => setBloomSize(Math.ceil(w / 2), Math.ceil(h / 2));
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // One light follows the focused cabinet (a light per cabinet made every lit pixel evaluate seven)
    const focusLight = new THREE.PointLight('#ffffff', 5, 7);
    scene.add(focusLight);

    const glowTex = canvasTexture(128, 128, (ctx, w) => {
        const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        g.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, w);
    });

    const updaters = [
        addSky(scene, camera, glowTex, low),
        addGround(scene),
        addStreetLamps(scene, glowTex),
        addSkyline(scene),
        addNumberLink(scene, modes, glowTex),
        addTraffic(scene, glowTex),
        addRain(scene, camera, low ? 260 : 600),
        addArcadeHall(scene),
    ];
    const cabinets = modes.map((m, i) => makeCabinet(scene, m, i, glowTex));

    let pos = 0, target = 0, zoom = 0, zoomTarget = 0, raf = 0, last = 0;
    const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    window.addEventListener('pointermove', (e) => {
        pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    });

    // Clicking a cabinet picks that mode; each cabinet has one invisible box to test against
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hitBoxes = cabinets.map((c) => c.hit);
    const cabinetAt = (e) => {
        const rect = canvas.getBoundingClientRect();
        ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObjects(hitBoxes, false)[0];
        return hit ? hit.object.parent.userData.index : -1;
    };
    let hovering = false;
    canvas.addEventListener('pointermove', (e) => {
        if (!raf || e.pointerType === 'touch') return;
        const over = cabinetAt(e) >= 0;
        if (over !== hovering) {
            hovering = over;
            canvas.style.cursor = over ? 'pointer' : '';
            if (onHover) onHover(over);
        }
    });
    canvas.addEventListener('click', (e) => {
        const i = raf ? cabinetAt(e) : -1;
        if (i >= 0 && onPick) onPick(i);
    });

    // Camera pose for a fractional cabinet index t; zoom 1 = up against the focused screen
    function pose(t, time) {
        const i0 = Math.floor(t), i1 = Math.min(i0 + 1, modes.length - 1);
        const x = lerp(sideOf(i0), sideOf(i1), t - i0) * CAB_X;
        const z = -t * SPACING;
        // Wide screens keep the camera centered so the cabinet sits beside the card;
        // narrow screens frame the cabinet above the bottom card
        const narrow = camera.aspect < 0.9;
        // Less-wide screens (e.g. 4:3) slide toward the cabinet so it isn't cut off at the edge
        const shift = narrow ? 0.9 : THREE.MathUtils.clamp((1.8 - camera.aspect) * 0.6, 0, 0.45);
        const drift = Math.sin(time * 0.4) * 0.06 + pointer.sx * 0.35;
        const cam = [x * shift + drift, (narrow ? 1.6 : 1.75) - pointer.sy * 0.15, z + (narrow ? 7 : 5.6)];
        const look = [narrow ? x : x * shift, narrow ? 0.65 : 1.45, z];

        if (zoom > 0.001) {
            // Point straight at the screen face of the nearest cabinet
            const i = Math.round(t), s = sideOf(i), theta = -s * TILT;
            const nx = Math.sin(theta), nz = Math.cos(theta);
            const sx = s * CAB_X + nx * 0.3, sz = -i * SPACING + nz * 0.3;
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

    // Adaptive resolution: judge every half second; if over a quarter of frames missed 50 FPS, step the
    // pixel ratio down (and never climb back to that ratio this visit); after 5 s of smooth frames, step up
    let judgeAt = 0, calmSince = 0, frames = 0, slowFrames = 0, ceiling = maxRatio;
    const setRatio = (r) => {
        ratio = Math.round(r * 100) / 100;
        renderer.setPixelRatio(ratio);
        composer.setPixelRatio(ratio);
    };
    function adaptResolution(now, frameSec) {
        // Long gaps mean the tab was hidden or throttled, not that rendering is slow
        if (frameSec > 0.25 || document.hidden) return;
        frames++;
        if (frameSec > 0.02) slowFrames++;
        if (now < judgeAt) return;
        const slowShare = slowFrames / frames;
        frames = slowFrames = 0;
        judgeAt = now + 500;
        if (slowShare > 0.25 && ratio > MIN_RATIO) {
            ceiling = ratio - RATIO_STEP;
            setRatio(Math.max(MIN_RATIO, ratio - RATIO_STEP));
            calmSince = now;
        } else if (slowShare > 0.05) {
            calmSince = now;
        } else if (now - calmSince > 5000 && ratio + 0.01 < ceiling) {
            setRatio(Math.min(ceiling, ratio + RATIO_STEP));
            calmSince = now;
        }
    }

    function frame(now) {
        raf = requestAnimationFrame(frame);
        if (last) adaptResolution(now, (now - last) / 1000);
        const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
        last = now;
        const time = now / 1000;
        pos += (target - pos) * (1 - Math.exp(-dt * 4.5));
        zoom += (zoomTarget - zoom) * (1 - Math.exp(-dt * 6));
        pointer.sx += (pointer.x - pointer.sx) * (1 - Math.exp(-dt * 3));
        pointer.sy += (pointer.y - pointer.sy) * (1 - Math.exp(-dt * 3));
        pose(pos, time);
        for (const update of updaters) update(time, dt);
        cabinets.forEach((cab, i) => cab.update(time, Math.max(0, 1 - Math.abs(pos - i))));
        const i0 = THREE.MathUtils.clamp(Math.floor(pos), 0, cabinets.length - 1);
        const i1 = Math.min(i0 + 1, cabinets.length - 1), f = THREE.MathUtils.clamp(pos - i0, 0, 1);
        focusLight.position.lerpVectors(cabinets[i0].lightPos, cabinets[i1].lightPos, f);
        focusLight.color.lerpColors(cabinets[i0].accent, cabinets[i1].accent, f);
        composer.render(dt);
    }

    function resize() {
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        composer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    return {
        goTo(i, instant = false) {
            if (i !== target || instant) cabinets[i].powerOn(performance.now() / 1000);
            target = i;
            zoomTarget = 0;
            if (instant) { pos = i; zoom = 0; }
        },
        zoomIn() { zoomTarget = 1; },
        start() {
            if (raf) return;
            last = 0;
            // Re-probe the resolution each visit; skip judging the first 2 s (shader compiles, loading)
            ceiling = maxRatio;
            judgeAt = performance.now() + 2000;
            calmSince = judgeAt;
            frames = slowFrames = 0;
            resize();
            raf = requestAnimationFrame(frame);
        },
        stop() {
            cancelAnimationFrame(raf);
            raf = 0;
        },
    };
}

// Side profile in (z, y): kick plate, control panel, leaning screen, then a per-style crown
function profileShape(st) {
    const B = -0.45, F = 0.42, H = st.H;
    const [tz, ty] = st.screenTop;
    const s = new THREE.Shape();
    s.moveTo(B, 0);
    s.lineTo(F, 0);
    s.lineTo(F, 0.78);
    s.lineTo(F + st.jut, 0.86);
    s.lineTo(F + st.jut, 0.97);
    s.lineTo(0.30, 1.06);
    s.lineTo(tz, ty);
    if (st.top === 'marquee') {
        // classic overhanging lightbox
        s.lineTo(tz + 0.24, ty + 0.06);
        s.lineTo(tz + 0.24, H);
        s.lineTo(B, H);
    } else if (st.top === 'visor') {
        // deep hood shading the screen
        s.lineTo(tz + 0.44, ty + 0.1);
        s.lineTo(tz + 0.36, H);
        s.lineTo(B, H - 0.12);
    } else if (st.top === 'slant') {
        // racer: crown slopes back
        s.lineTo(tz + 0.22, H);
        s.lineTo(B, H - 0.5);
    } else if (st.top === 'step') {
        // stepped crown, like the top of a wall
        s.lineTo(tz + 0.24, ty + 0.06);
        s.lineTo(tz + 0.24, H - 0.2);
        s.lineTo(0.05, H - 0.2);
        s.lineTo(0.05, H);
        s.lineTo(-0.2, H);
        s.lineTo(-0.2, H - 0.12);
        s.lineTo(B, H - 0.12);
    } else if (st.top === 'peak') {
        // tall angular crown
        s.lineTo(tz + 0.1, H - 0.32);
        s.lineTo(-0.12, H);
        s.lineTo(B, H - 0.38);
    } else {
        // arch: rounded jukebox crown
        s.lineTo(tz + 0.12, H - 0.4);
        s.quadraticCurveTo(tz + 0.12, H, -0.16, H);
        s.quadraticCurveTo(B, H, B, H - 0.4);
    }
    s.lineTo(B, 0);
    return s;
}

function makeCabinet(scene, m, i, glowTex) {
    const st = STYLES[m.key] || STYLES.classic;
    const accent = new THREE.Color(m.accent);
    const accent2 = new THREE.Color(m.accent2);
    const side = sideOf(i);
    const cab = new THREE.Group();
    cab.position.set(side * CAB_X, 0, -i * SPACING);
    cab.rotation.y = -side * TILT;
    scene.add(cab);

    // Body: the side profile extruded across the width, with rounded edges and a tint of the mode color
    const shape = profileShape(st);
    const bodyGeo = new THREE.ExtrudeGeometry(shape, {
        depth: CAB_W, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 16,
    });
    bodyGeo.rotateY(-Math.PI / 2);
    bodyGeo.translate(CAB_W / 2, 0, 0);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x0e1226).lerp(accent, 0.12), roughness: 0.32, metalness: 0.55,
    });
    cab.add(new THREE.Mesh(bodyGeo, bodyMat));
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0a0c18, roughness: 0.45, metalness: 0.6 });

    // Side panels: neon trim along the silhouette and the mode's side art, each one draw call for both sides
    const outline = shape.getPoints(16);
    const center = outline.reduce((a, p) => a.add(p), new THREE.Vector2()).divideScalar(outline.length);
    const trimMat = new THREE.LineBasicMaterial({ color: accent.clone() });
    const sideX = CAB_W / 2 + 0.036;
    const trimPts = [];
    for (const x of [-sideX, sideX]) {
        outline.forEach((p, k) => {
            const q = outline[(k + 1) % outline.length];
            trimPts.push(new THREE.Vector3(x, p.y, p.x), new THREE.Vector3(x, q.y, q.x));
        });
    }
    cab.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(trimPts), trimMat));
    const artGeo = new THREE.ShapeGeometry(new THREE.Shape(outline.map(p => p.clone().lerp(center, 0.14))));
    artGeo.rotateY(-Math.PI / 2);
    // The +x panel is seen from the other side, so flip its UVs to read the right way round
    const rightArt = artGeo.clone().translate(sideX, 0, 0);
    const uv = rightArt.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, ART_FLIP - uv.getX(k));
    cab.add(new THREE.Mesh(mergeGeometries([artGeo.clone().translate(-sideX, 0, 0), rightArt]), new THREE.MeshBasicMaterial({
        map: sideArtTexture(m, st.H), transparent: true, side: THREE.DoubleSide, depthWrite: false,
    })));

    // Screen on the leaning face
    const [tz, ty] = st.screenTop;
    const theta = Math.atan2(0.30 - tz, ty - 1.06);
    const size = Math.min(1.02, Math.hypot(0.30 - tz, ty - 1.06) * 0.94);
    const normal = new THREE.Vector3(0, Math.sin(theta), Math.cos(theta));
    const screenPos = new THREE.Vector3(0, (1.06 + ty) / 2, (0.30 + tz) / 2);
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = screenCanvas.height = 256;
    const screenCtx = screenCanvas.getContext('2d');
    const screenTex = new THREE.CanvasTexture(screenCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    paintScreen(screenCtx, 256, m, 1, 0);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: screenTex }));
    screen.position.copy(screenPos).addScaledVector(normal, 0.04);
    screen.rotation.x = -theta;
    cab.add(screen);

    // Control panel on the sloped top; each mode has its own controller
    const front = [0.42 + st.jut, 0.97], back = [0.30, 1.06];
    const panel = new THREE.Group();
    panel.position.set(0, (front[1] + back[1]) / 2 + 0.03, (front[0] + back[0]) / 2);
    panel.rotation.x = Math.atan2(back[1] - front[1], front[0] - back[0]);
    cab.add(panel);
    const animatePanel = buildPanel(st.panel, panel, accent, accent2, darkMat);

    // Coin door with blinking slots and a neon kick strip
    const door = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.38, 0.05, 2, 0.02), darkMat);
    door.position.set(0, 0.42, 0.45);
    const slotColor = new THREE.Color('#ff7a3c');
    const slotMat = new THREE.MeshBasicMaterial({ color: slotColor.clone() });
    cab.add(new THREE.Mesh(mergeGeometries([-0.1, 0.1].map((x) => new THREE.PlaneGeometry(0.05, 0.11).translate(x, 0.5, 0.48))), slotMat));
    const kick = new THREE.Mesh(new THREE.BoxGeometry(CAB_W - 0.1, 0.03, 0.02), new THREE.MeshBasicMaterial({ color: accent }));
    kick.position.set(0, 0.07, 0.46);
    cab.add(door, kick);

    // Floating neon name sign, topper and floor glow
    const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.7, 0.42),
        new THREE.MeshBasicMaterial({
            map: canvasTexture(512, 128, (ctx, w, h) => paintMarquee(ctx, w, h, m)), transparent: true, depthWrite: false,
        })
    );
    sign.position.set(0, st.H + 1.0, 0.1);
    const topper = new THREE.Group();
    topper.position.set(0, st.H + 0.42, -0.02);
    const spinTopper = buildTopper(st.topper, topper, m, accent, accent2, glowTex);
    const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(4.5, 4.5),
        new THREE.MeshBasicMaterial({
            map: glowTex, color: accent, transparent: true, opacity: 0.5,
            blending: THREE.AdditiveBlending, depthWrite: false,
        })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, 0.02, 0.8);
    cab.userData.index = i;
    // Invisible box for click and hover tests: one cheap raycast target instead of every part
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.5, st.H + 1.4, 1.4), new THREE.MeshBasicMaterial());
    hit.position.set(0, (st.H + 1.4) / 2, 0.1);
    hit.visible = false;
    cab.add(sign, topper, glow, hit);
    cab.updateMatrixWorld(true);

    const demoSec = (m.board.demoMs || 3000) / 1000;
    let flickerFrom = -10, attractStart = 0, lastPaint = 0, painted = true;

    return {
        hit,
        accent,
        // Where the shared focus light sits when this cabinet is focused
        lightPos: cab.localToWorld(new THREE.Vector3(0, 1.6, 1.4)),
        powerOn(time) {
            flickerFrom = time;
            attractStart = time;
        },
        update(time, focus) {
            trimMat.color.copy(accent).multiplyScalar(0.5 + focus);
            glow.material.opacity = 0.12 + 0.18 * focus + 0.04 * Math.sin(time * 2 + i);
            slotMat.color.copy(slotColor).multiplyScalar(Math.sin(time * 2.5 + i) > 0 ? 1 : 0.35);
            // Power-on flicker: two short blinks in the first half second (stays under 3 flashes/s)
            const f = time - flickerFrom;
            sign.visible = !((f > 0.08 && f < 0.16) || (f > 0.3 && f < 0.36));
            spinTopper(time, focus);
            animatePanel(time);

            // Attract mode: the focused screen redraws its demo path on a loop
            if (focus > 0.5) {
                if (time - lastPaint > 0.04) {
                    const p = Math.min(((time - attractStart) % (demoSec + 1.4)) / demoSec, 1);
                    paintScreen(screenCtx, 256, m, p, time);
                    screenTex.needsUpdate = true;
                    lastPaint = time;
                    painted = false;
                }
            } else if (!painted) {
                paintScreen(screenCtx, 256, m, 1, 0);
                screenTex.needsUpdate = true;
                painted = true;
            }
        },
    };
}

// Small animated prop above each cabinet that hints at its mode; returns its per-frame update
function buildTopper(kind, group, m, accent, accent2, glowTex) {
    const basic = (c) => new THREE.MeshBasicMaterial({ color: c });
    if (kind === 'orbs') {
        // Three link endpoints orbiting a ring
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.008, 6, 48), basic(accent));
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
        ['#ef4444', '#3b82f6', '#10b981'].forEach((c, k) => {
            const orb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), basic(c));
            const a = (k / 3) * Math.PI * 2;
            orb.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
            group.add(orb);
        });
        return (time) => { group.rotation.y = time * 0.8; };
    }
    if (kind === 'stopwatch') {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 10, 40), basic(accent));
        const hand = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.17, 0.02), basic(accent2));
        hand.geometry.translate(0, 0.075, 0);
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 10), basic(accent));
        crown.position.y = 0.26;
        group.add(ring, hand, crown);
        return (time) => { hand.rotation.z = -time * 4; };
    }
    if (kind === 'eye') {
        // An eye that blinks now and then
        const eye = new THREE.Group();
        const lid = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 8, 40), basic(accent));
        lid.scale.y = 0.5;
        const iris = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), basic(accent2));
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), basic('#05060e'));
        pupil.position.z = 0.06;
        eye.add(lid, iris, pupil);
        group.add(eye);
        return (time) => { eye.scale.y = (time % 3.6) < 0.14 ? 0.12 : 1; };
    }
    if (kind === 'crystal') {
        const outer = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), new THREE.MeshBasicMaterial({ color: accent, wireframe: true }));
        const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), basic(accent2));
        group.add(outer, inner);
        const baseY = group.position.y;
        return (time) => {
            outer.rotation.y = time * 0.9;
            inner.rotation.y = -time * 1.4;
            group.position.y = baseY + Math.sin(time * 1.5) * 0.05;
        };
    }
    if (kind === 'portals') {
        // Two teleporter rings with a spark hopping between them
        const rings = ['#a855f7', '#06b6d4'].map((c, k) => {
            const r = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.02, 8, 32), basic(c));
            const disc = new THREE.Mesh(
                new THREE.CircleGeometry(0.14, 24),
                new THREE.MeshBasicMaterial({ map: glowTex, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
            );
            r.position.x = disc.position.x = k ? 0.32 : -0.32;
            group.add(r, disc);
            return r;
        });
        const spark = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), basic('#ffffff'));
        group.add(spark);
        return (time) => {
            rings[0].rotation.y = time * 2;
            rings[1].rotation.y = -time * 2;
            const u = (time % 1.6) / 1.6;
            spark.position.set(lerp(-0.32, 0.32, u), Math.sin(u * Math.PI) * 0.18, 0);
        };
    }
    // letters: W-O-R-D-S circling the crown
    const letters = 'WORDS'.split('').map((ch, k) => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: canvasTexture(64, 64, (ctx, w) => {
                ctx.font = `900 ${w * 0.7}px Orbitron, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = k % 2 ? m.accent2 : m.accent;
                ctx.fillText(ch, w / 2, w / 2 + 2);
            }),
            transparent: true,
            depthWrite: false,
        }));
        sprite.scale.set(0.24, 0.24, 1);
        group.add(sprite);
        return sprite;
    });
    return (time) => {
        letters.forEach((s, k) => {
            const a = time * 0.9 + (k / letters.length) * Math.PI * 2;
            s.position.set(Math.cos(a) * 0.36, Math.sin(time * 2 + k) * 0.05, Math.sin(a) * 0.36);
        });
    };
}

// Control panel per mode, idling as if someone is playing; returns its per-frame update
function buildPanel(kind, panel, accent, accent2, darkMat) {
    const glowMat = (c, k = 0.6) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.3 });
    const add = (geo, mat, x, y, z, parent = panel) => {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        parent.add(mesh);
        return mesh;
    };
    const btnMats = [glowMat(accent), glowMat(accent2), glowMat(new THREE.Color('#ffffff'), 0.4)];
    const btnGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16);
    const button = (x, z, k) => add(btnGeo, btnMats[k % 3], x, 0.015, z);

    if (kind === 'wheel') {
        // Racing wheel on a steering column
        const wheel = add(new THREE.TorusGeometry(0.17, 0.028, 10, 32), glowMat(accent, 0.5), 0, 0.14, -0.02);
        wheel.rotation.x = -0.6;
        add(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 12), darkMat, 0, 0.07, 0);
        button(-0.42, 0, 1);
        button(0.42, 0, 0);
        return (time) => { wheel.rotation.z = Math.sin(time * 1.3) * 0.35; };
    }
    if (kind === 'joystick') {
        // Ball-top joystick and three buttons
        add(new THREE.CylinderGeometry(0.06, 0.07, 0.02, 20), darkMat, -0.3, 0.01, 0);
        const stick = new THREE.Group();
        stick.position.set(-0.3, 0.01, 0);
        panel.add(stick);
        add(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), darkMat, 0, 0.07, 0, stick);
        add(new THREE.SphereGeometry(0.045, 16, 12), glowMat(accent, 0.7), 0, 0.15, 0, stick);
        for (let k = 0; k < 3; k++) button(0.02 + k * 0.14, 0, k);
        return (time) => {
            stick.rotation.z = Math.sin(time * 1.7) * 0.25;
            stick.rotation.x = Math.cos(time * 1.1) * 0.2;
        };
    }
    if (kind === 'trackball') {
        // Glowing trackball in a bezel ring; the wire overlay shows it rolling
        const ring = add(new THREE.TorusGeometry(0.1, 0.014, 8, 32), darkMat, -0.22, 0.01, 0);
        ring.rotation.x = Math.PI / 2;
        const ball = add(new THREE.SphereGeometry(0.085, 24, 16), new THREE.MeshStandardMaterial({
            color: accent, emissive: accent, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.2,
        }), -0.22, 0.02, 0);
        add(new THREE.SphereGeometry(0.087, 8, 6), new THREE.MeshBasicMaterial({
            color: accent2, wireframe: true, transparent: true, opacity: 0.5,
        }), 0, 0, 0, ball);
        button(0.12, 0, 1);
        button(0.3, 0, 2);
        return (time) => {
            ball.rotation.x = time * 1.2;
            ball.rotation.z = time * 0.7;
        };
    }
    if (kind === 'spinner') {
        // Rotary spinner knob with grip ridges and a marker, plus a row of buttons
        const knob = add(new THREE.CylinderGeometry(0.075, 0.08, 0.06, 10), darkMat, -0.25, 0.03, 0);
        add(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 24), glowMat(accent, 0.8), 0, 0.035, 0, knob);
        add(new THREE.BoxGeometry(0.012, 0.014, 0.05), glowMat(accent2, 0.8), 0, 0.04, 0.03, knob);
        for (let k = 0; k < 4; k++) button(k * 0.12, 0, k);
        return (time) => { knob.rotation.y = time * 1.5; };
    }
    if (kind === 'dpad') {
        // Cross-shaped D-pad (the mode is played with arrow keys) and two action buttons
        const pad = new THREE.Group();
        pad.position.set(-0.26, 0.015, 0);
        panel.add(pad);
        const arm = new THREE.BoxGeometry(0.17, 0.03, 0.055);
        add(arm, darkMat, 0, 0, 0, pad);
        add(arm, darkMat, 0, 0, 0, pad).rotation.y = Math.PI / 2;
        add(new THREE.CylinderGeometry(0.02, 0.02, 0.034, 12), glowMat(accent, 0.8), 0, 0, 0, pad);
        const tips = [[0.07, 0], [0, 0.07], [-0.07, 0], [0, -0.07]].map(([x, z]) =>
            add(new THREE.BoxGeometry(0.022, 0.034, 0.022), glowMat(accent2, 0.2), x, 0.002, z, pad));
        button(0.16, -0.02, 0);
        button(0.3, 0.02, 1);
        // Arrows light in turn: each tip lights for half a second every 2 s
        return (time) => {
            const lit = Math.floor(time * 2) % 4;
            tips.forEach((tip, k) => { tip.material.emissiveIntensity = k === lit ? 1.2 : 0.15; });
        };
    }
    // keyboard: three rows of keycaps in one instanced mesh, lit one at a time as if someone is typing
    const spots = [], colors = [];
    for (let row = 0; row < 3; row++) {
        for (let k = 0; k < 9 - row; k++) {
            spots.push([-0.36 + row * 0.035 + k * 0.08, -0.075 + row * 0.065]);
            colors.push(new THREE.Color(row === 1 && k === 3 ? accent2 : '#cfd6ff'));
        }
    }
    const keys = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.022, 0.05), new THREE.MeshBasicMaterial(), spots.length);
    keys.frustumCulled = false;
    panel.add(keys);
    const dummy = new THREE.Object3D(), tint = new THREE.Color();
    const setKey = (k, pressed) => {
        dummy.position.set(spots[k][0], pressed ? 0.004 : 0.011, spots[k][1]);
        dummy.updateMatrix();
        keys.setMatrixAt(k, dummy.matrix);
        keys.setColorAt(k, tint.copy(colors[k]).multiplyScalar(pressed ? 1 : 0.3));
    };
    spots.forEach((_, k) => setKey(k, false));
    let lit = -1;
    return (time) => {
        const next = Math.floor(time * 4) % spots.length;
        if (next === lit) return;
        if (lit >= 0) setKey(lit, false);
        setKey(next, true);
        lit = next;
        keys.instanceMatrix.needsUpdate = true;
        keys.instanceColor.needsUpdate = true;
    };
}

// Cabinet screen: the preview board with its demo path drawn up to `progress` (0..1)
function paintScreen(ctx, s, m, progress, time) {
    const b = m.board, n = 5, pad = s * 0.08, cell = (s - pad * 2) / n;
    const at = (v) => pad + (v + 0.5) * cell;

    ctx.fillStyle = '#0b0e1f';
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

    // Demo path, cut at `progress`; null entries are teleport jumps
    const demo = b.demo || [];
    const reach = (demo.length - 1) * progress;
    ctx.strokeStyle = m.accent;
    ctx.lineWidth = cell * 0.3;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.shadowColor = m.accent;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    let penDown = false, head = null;
    for (let k = 0; k < demo.length && k <= Math.ceil(reach); k++) {
        if (!demo[k]) { penDown = false; continue; }
        let [r, c] = demo[k];
        const prev = demo[k - 1];
        if (k > reach && prev && penDown) {
            const f = reach - (k - 1);
            r = lerp(prev[0], r, f);
            c = lerp(prev[1], c, f);
        }
        if (penDown) ctx.lineTo(at(c), at(r));
        else ctx.moveTo(at(c), at(r));
        penDown = true;
        head = [at(c), at(r)];
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

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
    if (head && progress < 1) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(head[0], head[1], cell * 0.12, 0, Math.PI * 2);
        ctx.fill();
    }

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

    // CRT: scanlines that crawl, a slow rolling bright band, and an accent bezel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    const crawl = Math.floor(time * 20) % 4;
    for (let y = crawl; y < s; y += 4) ctx.fillRect(0, y, s, 1);
    if (time) {
        const band = ((time * 0.35) % 1.3 - 0.15) * s;
        const g = ctx.createLinearGradient(0, band - 30, 0, band + 30);
        g.addColorStop(0, 'rgba(255, 255, 255, 0)');
        g.addColorStop(0.5, 'rgba(255, 255, 255, 0.07)');
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, band - 30, s, 60);
    }
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

// Side art in the mode's colors; UVs of the side panel are profile units (z, y)
function sideArtTexture(m, H) {
    const tex = canvasTexture(256, 512, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, h, w, 0);
        g.addColorStop(0, m.accent);
        g.addColorStop(1, m.accent2);
        ctx.fillStyle = ctx.strokeStyle = g;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (m.key === 'speedrun') {
            // Checkered flag band
            ctx.globalAlpha = 0.5;
            for (let r = 0; r < 4; r++) {
                for (let c = 0; c < w / 22; c++) if ((r + c) % 2 === 0) ctx.fillRect(c * 22, h * 0.48 + r * 22, 22, 22);
            }
        } else if (m.key === 'blindfold') {
            // Question marks: what's hidden?
            ctx.font = '900 54px Orbitron, sans-serif';
            [[0.3, 0.36], [0.7, 0.48], [0.4, 0.62], [0.75, 0.74], [0.25, 0.84]].forEach(([x, y], k) => {
                ctx.globalAlpha = 0.25 + (k % 2) * 0.25;
                ctx.fillText('?', w * x, h * y);
            });
        } else if (m.key === 'optimal') {
            // The shortest route: an L-shaped path between two dots on a faint grid
            ctx.globalAlpha = 0.18;
            ctx.lineWidth = 2;
            for (let x = 16; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, h * 0.35); ctx.lineTo(x, h * 0.9); ctx.stroke(); }
            for (let y = h * 0.35; y < h * 0.9; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
            ctx.globalAlpha = 0.65;
            ctx.lineWidth = 12;
            ctx.lineCap = ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(w * 0.2, h * 0.42);
            ctx.lineTo(w * 0.2, h * 0.8);
            ctx.lineTo(w * 0.8, h * 0.8);
            ctx.stroke();
            [[0.2, 0.42], [0.8, 0.8]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(w * x, h * y, 14, 0, Math.PI * 2); ctx.fill(); });
        } else if (m.key === 'obstacles') {
            // Hazard stripes in the game's wall orange
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = '#f97316';
            const top = h * 0.5, band = h * 0.16;
            ctx.beginPath();
            ctx.rect(0, top, w, band);
            ctx.clip();
            for (let x = -band; x < w + band; x += 40) {
                ctx.beginPath();
                ctx.moveTo(x, top);
                ctx.lineTo(x + 20, top);
                ctx.lineTo(x + 20 + band, top + band);
                ctx.lineTo(x + band, top + band);
                ctx.fill();
            }
        } else if (m.key === 'words') {
            // Scattered letters
            ctx.font = '900 40px Orbitron, sans-serif';
            'LINKWORDSPLAY'.split('').forEach((ch, k) => {
                ctx.globalAlpha = 0.2 + (k % 3) * 0.15;
                ctx.fillText(ch, w * (0.15 + ((k * 37) % 70) / 100), h * (0.34 + ((k * 23) % 55) / 100));
            });
        } else {
            // Diagonal speed stripes
            for (let k = 0; k < 3; k++) {
                const y = h * (0.42 + k * 0.1), t = 22 - k * 6;
                ctx.globalAlpha = 0.55 - k * 0.12;
                ctx.beginPath();
                ctx.moveTo(0, y + 70);
                ctx.lineTo(w, y - 70);
                ctx.lineTo(w, y - 70 + t);
                ctx.lineTo(0, y + 70 + t);
                ctx.fill();
            }
        }
    });
    tex.repeat.set(ART_REPEAT, 1 / H);
    tex.offset.set(ART_OFFSET, 0);
    return tex;
}

// Stars and a moon that follow the camera so they read as infinitely far away
function addSky(scene, camera, glowTex, low) {
    const sky = new THREE.Group();
    scene.add(sky);
    const layers = [0, 1].map((k) => {
        const n = low ? 110 : 240;
        const pos = new Float32Array(n * 3);
        for (let j = 0; j < n; j++) {
            pos[j * 3] = (Math.random() - 0.5) * 240;
            pos[j * 3 + 1] = 16 + Math.random() * 70;
            pos[j * 3 + 2] = -70 - Math.random() * 50;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({
            color: 0xcdd8ff, size: k ? 2.2 : 1.4, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false,
        });
        sky.add(new THREE.Points(geo, mat));
        return mat;
    });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x3c4a8c, fog: false, depthWrite: false }));
    halo.scale.set(26, 26, 1);
    halo.position.set(-34, 40, -110);
    const moon = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), new THREE.MeshBasicMaterial({ color: 0xa9b5e6, fog: false }));
    moon.position.set(-34, 40, -109);
    sky.add(halo, moon);

    return (time) => {
        sky.position.z = camera.position.z;
        layers[0].opacity = 0.55 + 0.45 * Math.sin(time * 1.3);
        layers[1].opacity = 0.55 + 0.45 * Math.sin(time * 0.9 + 2);
    };
}

// Wet, reflective street with a grid and neon lane edges whose light pulses run down the street
function addGround(scene) {
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(240, 240),
        new THREE.MeshStandardMaterial({ color: 0x07080f, roughness: 0.22, metalness: 0.8 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.01, -30);
    const grid = new THREE.GridHelper(240, 240, 0x2b3675, 0x141936);
    grid.position.z = -30;
    scene.add(ground, grid);

    const dash = canvasTexture(16, 256, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
        g.addColorStop(0.45, 'rgba(255, 255, 255, 1)');
        g.addColorStop(0.55, 'rgba(255, 255, 255, 0.15)');
        g.addColorStop(1, 'rgba(255, 255, 255, 0.15)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    });
    dash.wrapT = THREE.RepeatWrapping;
    dash.repeat.set(1, 14);
    for (const side of [-1, 1]) {
        const strip = new THREE.Mesh(
            new THREE.PlaneGeometry(0.06, 90),
            new THREE.MeshBasicMaterial({
                map: dash, color: side > 0 ? '#b8399a' : '#2f9db0', transparent: true,
                blending: THREE.AdditiveBlending, depthWrite: false,
            })
        );
        strip.rotation.x = -Math.PI / 2;
        strip.position.set(side * 3.3, 0.01, -25);
        scene.add(strip);
    }
    return (time, dt) => { dash.offset.y -= dt * 0.35; };
}

// Lamp posts between the cabinets; one tube is failing
function addStreetLamps(scene, glowTex) {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x1a1f38, roughness: 0.5, metalness: 0.6 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: '#e0b98c' });
    const poolMat = new THREE.MeshBasicMaterial({
        map: glowTex, color: '#ffb46b', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const postGeo = new THREE.CylinderGeometry(0.05, 0.07, 4.2, 10);
    const armGeo = new THREE.BoxGeometry(0.8, 0.05, 0.05);
    const bulbGeo = new THREE.SphereGeometry(0.11, 12, 8);
    const poolGeo = new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2);
    const posts = [], bulbs = [], pools = [];
    let failing = null;

    for (let k = 0; k < 9; k++) {
        for (const side of [-1, 1]) {
            const x = side * 4.4, z = 3.5 - k * SPACING, bx = x - side * 0.75;
            posts.push(postGeo.clone().translate(x, 2.1, z), armGeo.clone().translate(x - side * 0.38, 4.15, z));
            const bulb = bulbGeo.clone().translate(bx, 4.05, z);
            const pool = poolGeo.clone().translate(bx, 0.02, z);
            if (k === 2 && side > 0) failing = [new THREE.Mesh(bulb, bulbMat), new THREE.Mesh(pool, poolMat)];
            else { bulbs.push(bulb); pools.push(pool); }
        }
    }
    scene.add(
        new THREE.Mesh(mergeGeometries(posts), postMat),
        new THREE.Mesh(mergeGeometries(bulbs), bulbMat),
        new THREE.Mesh(mergeGeometries(pools), poolMat),
        ...failing,
    );
    // Two short drop-outs every few seconds (stays under 3 flashes/s)
    return (time) => {
        const f = time % 3.1;
        const on = !((f > 0 && f < 0.1) || (f > 0.32 && f < 0.42));
        failing.forEach((o) => { o.visible = on; });
    };
}

// Towers with lit windows, blade signs facing the street and rooftop beacons, all the way to the arcade hall
function addSkyline(scene) {
    const tints = ['#ffd9a0', '#9fc4ff', '#ff9ad5'];
    const windows = canvasTexture(128, 256, (ctx, w, h) => {
        ctx.fillStyle = '#06070f';
        ctx.fillRect(0, 0, w, h);
        for (let y = 8; y < h - 8; y += 10) {
            for (let x = 6; x < w - 8; x += 12) {
                if (Math.random() > 0.3) continue;
                ctx.globalAlpha = 0.25 + Math.random() * 0.5;
                ctx.fillStyle = tints[Math.floor(Math.random() * tints.length)];
                ctx.fillRect(x, y, 6, 5);
            }
        }
    });
    const towerMat = new THREE.MeshBasicMaterial({ map: windows });
    const signWords = ['ARCADE', 'LINK', 'PLAY', 'NEON', '24H', 'GAME', 'OPEN', '1·2·3'];
    const signColors = ['#ff4fd8', '#46e8ff', '#ffd166', '#a78bfa', '#7ef0c4'];
    const beaconMat = new THREE.MeshBasicMaterial({ color: '#ff3b3b' });
    const beaconGeo = new THREE.SphereGeometry(0.18, 8, 6);
    const flickering = [];
    const towers = [], beacons = [[], []];

    for (let i = 0; i < 44; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const w = 3 + Math.random() * 4, h = 6 + Math.random() * 18, d = 3 + Math.random() * 4;
        const x = side * (8 + w / 2 + Math.random() * 5), z = 8 - Math.floor(i / 2) * 3.6;
        towers.push(new THREE.BoxGeometry(w, h, d).translate(x, h / 2, z));

        if (i % 3 === 0) {
            // Blade sign sticking out from the street-side corner so it faces the camera
            const word = signWords[(i / 3) % signWords.length];
            const color = signColors[(i / 3) % signColors.length];
            const sign = new THREE.Mesh(
                new THREE.PlaneGeometry(0.9, 0.9 * Math.max(3, word.length) * 0.75),
                new THREE.MeshBasicMaterial({ map: bladeSignTexture(word, color), transparent: true, depthWrite: false })
            );
            sign.position.set(x - side * (w / 2 + 0.55), Math.min(h - 1.5, 4 + Math.random() * 4), z + d / 2 - 0.2);
            scene.add(sign);
            if (flickering.length < 2) flickering.push(sign);
        }
        if (h > 17) beacons[i % 2].push(beaconGeo.clone().translate(x, h + 0.3, z));
    }
    scene.add(new THREE.Mesh(mergeGeometries(towers), towerMat));
    // Two groups of rooftop beacons blinking in turn
    const beaconGroups = beacons.filter((list) => list.length).map((list) => {
        const mesh = new THREE.Mesh(mergeGeometries(list), beaconMat);
        scene.add(mesh);
        return mesh;
    });

    return (time) => {
        beaconGroups.forEach((b, k) => { b.visible = (time + k * 0.8) % 1.6 < 0.8; });
        flickering.forEach((sign, k) => {
            const f = (time + k * 1.7) % 4.3;
            sign.visible = !((f > 0 && f < 0.09) || (f > 0.28 && f < 0.36));
        });
    };
}

// The street ends at an arcade hall: a neon gateway, plaza props, and the INSERT COIN billboard on the roof.
// Static parts that share a material are merged so the whole hall costs a handful of draw calls.
function addArcadeHall(scene) {
    const front = -SPACING * 5 - 26; // hall facade, well past the last cabinet
    const hall = new THREE.Group();
    hall.position.z = front;
    scene.add(hall);
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c0f22, roughness: 0.5, metalness: 0.5 });
    const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });
    const add = (parent, geo, mat, x, y, z) => {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        parent.add(mesh);
        return mesh;
    };
    const at = (geo, x, y, z) => geo.clone().translate(x, y, z);
    const edges = (geo, x, y, z) => new THREE.EdgesGeometry(geo).translate(x, y, z);
    const gateZ = 14;               // gateway arch, in front of the hall
    const claw = [-4.4, 0, 1.2];    // claw machine position

    // Dark structure: building, billboard posts, gateway pillars, vending boxes, claw machine base and roof
    const bodyGeo = new THREE.BoxGeometry(18, 8, 6);
    const pillarGeo = new THREE.BoxGeometry(0.4, 5.5, 0.4);
    const clawBaseGeo = new THREE.BoxGeometry(1.2, 0.9, 1.2);
    const glassGeo = new THREE.BoxGeometry(1.2, 1.3, 1.2);
    const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.2, 8);
    const vendGeo = new THREE.BoxGeometry(1.1, 2.1, 0.8);
    hall.add(new THREE.Mesh(mergeGeometries([
        at(bodyGeo, 0, 4, -3),
        at(postGeo, -4.5, 9.1, -0.8), at(postGeo, 4.5, 9.1, -0.8),
        at(pillarGeo, -4.2, 2.75, gateZ), at(pillarGeo, 4.2, 2.75, gateZ),
        at(vendGeo, 4.2, 1.05, 1), at(vendGeo, 5.5, 1.05, 1),
        at(clawBaseGeo, claw[0], 0.45, claw[2]),
        at(new THREE.BoxGeometry(1.2, 0.3, 1.2), claw[0], 2.35, claw[2]),
    ]), dark));

    // Neon outlines and light strips
    hall.add(
        new THREE.LineSegments(edges(bodyGeo, 0, 4, -3), new THREE.LineBasicMaterial({ color: '#ff4fd8' })),
        new THREE.LineSegments(edges(clawBaseGeo, claw[0], 0.45, claw[2]), new THREE.LineBasicMaterial({ color: '#ffd166' })),
        new THREE.LineSegments(mergeGeometries([
            edges(pillarGeo, -4.2, 2.75, gateZ), edges(pillarGeo, 4.2, 2.75, gateZ), edges(glassGeo, claw[0], 1.55, claw[2]),
        ]), new THREE.LineBasicMaterial({ color: '#46e8ff' })),
    );
    const strip = new THREE.BoxGeometry(17.4, 0.06, 0.06);
    hall.add(new THREE.Mesh(mergeGeometries([at(strip, 0, 5.6, 0.03), at(strip, 0, 6.5, 0.03)]), basic('#46e8ff')));

    // Glowing open entrance under a striped awning
    add(hall, new THREE.PlaneGeometry(4.2, 3.2), basic('#ffffff', {
        map: canvasTexture(256, 196, (ctx, w, h) => {
            const g = ctx.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, '#ffcf8a');
            g.addColorStop(1, '#ff6fb5');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(8, 10, 24, 0.55)';
            ctx.fillRect(w / 2 - 3, 0, 6, h);
            ctx.font = '900 34px Orbitron, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('OPEN', w / 2, h * 0.32);
        }),
    }), 0, 1.6, 0.02);
    add(hall, new THREE.BoxGeometry(5, 0.16, 1.2), basic('#ffffff', {
        map: canvasTexture(128, 16, (ctx, w, h) => {
            for (let x = 0; x < w; x += 16) {
                ctx.fillStyle = (x / 16) % 2 ? '#ff4fd8' : '#1a1030';
                ctx.fillRect(x, 0, 16, h);
            }
        }),
    }), 0, 3.45, 0.6);
    add(hall, new THREE.PlaneGeometry(5, 1.1), basic('#ffffff', {
        map: canvasTexture(512, 116, (ctx, w, h) => {
            ctx.fillStyle = 'rgba(8, 10, 24, 0.9)';
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = '#ff4fd8';
            ctx.lineWidth = 6;
            ctx.strokeRect(3, 3, w - 6, h - 6);
            ctx.fillStyle = '#ffd166';
            ctx.shadowColor = '#ffd166';
            ctx.shadowBlur = 12;
            ctx.font = '900 54px Orbitron, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('ARCADE HALL', w / 2, h / 2 + 2);
        }),
        transparent: true,
    }), 0, 4.6, 0.04);

    // The INSERT COIN billboard on the roof; its color slowly shifts
    const billboard = add(hall, new THREE.PlaneGeometry(14, 4.2), new THREE.MeshBasicMaterial({
        map: canvasTexture(1024, 308, (ctx, w, h) => {
            ctx.fillStyle = 'rgba(8, 10, 24, 0.85)';
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 8;
            ctx.strokeRect(10, 10, w - 20, h - 20);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '900 120px Orbitron, sans-serif';
            ctx.fillText('INSERT COIN', w / 2, h * 0.44);
            ctx.font = '700 36px Outfit, sans-serif';
            ctx.fillText('NUMBER LINK ARCADE  ·  SIX MODES  ·  ONE BOARD', w / 2, h * 0.78);
        }),
        transparent: true,
        fog: false,
    }), 0, 10.6, -0.6);

    // Slowly turning wireframe hologram above the roof
    const holo = add(hall, new THREE.IcosahedronGeometry(1.8, 0), basic('#7ef0c4', { wireframe: true, fog: false }), 0, 15.2, -3);
    const core = add(holo, new THREE.OctahedronGeometry(0.6), basic('#c39bff', { fog: false }), 0, 0, 0);

    // Gateway arcs over the street
    add(hall, new THREE.TorusGeometry(4.2, 0.07, 8, 64, Math.PI), basic('#ff4fd8'), 0, 5.5, gateZ);
    add(hall, new THREE.TorusGeometry(3.9, 0.04, 8, 64, Math.PI), basic('#46e8ff'), 0, 5.5, gateZ);

    // Neon rings on the plaza floor
    for (const [r, color] of [[5.6, '#46e8ff'], [4.4, '#ff4fd8']]) {
        const ring = add(hall, new THREE.RingGeometry(r, r + 0.12, 72), basic(color, {
            transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
        }), 0, 0.03, 6);
        ring.rotation.x = -Math.PI / 2;
    }

    // Lit fronts of the two drink vending machines
    const vendFront = canvasTexture(128, 256, (ctx, w, h) => {
        ctx.fillStyle = '#10142e';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#46e8ff';
        ctx.font = '900 20px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('DRINKS', w / 2, 30);
        const cans = ['#ff4fd8', '#ffd166', '#7ef0c4', '#8fa8ff'];
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 3; c++) {
                ctx.fillStyle = cans[(r + c) % cans.length];
                ctx.fillRect(16 + c * 36, 48 + r * 44, 24, 34);
            }
        }
        ctx.fillStyle = '#ff7a3c';
        ctx.fillRect(w / 2 - 20, h - 26, 40, 8);
    });
    const vendPlane = new THREE.PlaneGeometry(0.95, 1.9);
    hall.add(new THREE.Mesh(mergeGeometries([at(vendPlane, 4.2, 1.05, 1.41), at(vendPlane, 5.5, 1.05, 1.41)]), basic('#ffffff', { map: vendFront })));

    // Claw machine glass, sign and prizes; the claw roams and drops for a prize
    add(hall, glassGeo, basic('#9fb4ff', { transparent: true, opacity: 0.08, depthWrite: false }), claw[0], 1.55, claw[2]);
    add(hall, new THREE.PlaneGeometry(1.1, 0.24), basic('#ffffff', {
        map: canvasTexture(256, 56, (ctx, w, h) => {
            ctx.fillStyle = '#1a1030';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#ffd166';
            ctx.font = '900 34px Orbitron, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('PRIZES', w / 2, h / 2 + 2);
        }),
    }), claw[0], 2.35, claw[2] + 0.61);
    const prize = new THREE.SphereGeometry(0.12, 12, 8);
    hall.add(new THREE.Mesh(mergeGeometries(['#ff4fd8', '#46e8ff', '#ffd166', '#7ef0c4', '#8fa8ff', '#ff7a3c'].map((color, k) => {
        const g = at(prize, claw[0] - 0.35 + (k % 3) * 0.35, 1.02, claw[2] - 0.2 + Math.floor(k / 3) * 0.4);
        const c = new THREE.Color(color);
        g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: g.attributes.position.count }, () => [c.r, c.g, c.b]).flat(), 3));
        return g;
    })), new THREE.MeshBasicMaterial({ vertexColors: true })));
    const prong = new THREE.BoxGeometry(0.03, 0.14, 0.03);
    const grabber = add(hall, mergeGeometries([
        at(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), 0, 0.25, 0),
        ...[0, 1, 2].map((k) => at(prong, Math.cos((k / 3) * Math.PI * 2) * 0.06, -0.03, Math.sin((k / 3) * Math.PI * 2) * 0.06)),
    ]), basic('#cfd6ff'), claw[0], 1.9, claw[2]);

    return (time) => {
        billboard.material.color.setHSL((0.62 + time * 0.03) % 1, 0.7, 0.55);
        holo.rotation.y = time * 0.25;
        holo.rotation.x = Math.sin(time * 0.3) * 0.3;
        core.rotation.y = -time * 0.8;
        // Claw: roam for 4 s, then drop and rise over 2 s
        const cycle = time % 6;
        grabber.position.x = claw[0] + Math.sin(time * 0.6) * 0.4;
        grabber.position.z = claw[2] + Math.cos(time * 0.45) * 0.35;
        grabber.position.y = cycle < 4 ? 1.9 : 1.9 - Math.sin(((cycle - 4) / 2) * Math.PI) * 0.65;
    };
}

function bladeSignTexture(word, color) {
    const chars = word.split('');
    return canvasTexture(96, 96 * Math.max(3, chars.length) * 0.75, (ctx, w, h) => {
        ctx.fillStyle = 'rgba(8, 10, 24, 0.9)';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 46px Orbitron, sans-serif';
        const step = (h - 20) / chars.length;
        chars.forEach((ch, k) => ctx.fillText(ch, w / 2, 10 + step * (k + 0.5)));
    });
}

// "Number link" in the sky: tiles 1-8 floating over the street, joined by a line a spark runs along
function addNumberLink(scene, modes, glowTex) {
    const tileGeo = new RoundedBoxGeometry(0.75, 0.75, 0.75, 3, 0.12);
    const tiles = Array.from({ length: 8 }, (_, k) => {
        const color = modes[k % modes.length].accent;
        const mesh = new THREE.Mesh(tileGeo, new THREE.MeshBasicMaterial({
            map: canvasTexture(128, 128, (ctx, w) => {
                ctx.fillStyle = 'rgba(10, 12, 30, 0.88)';
                ctx.fillRect(0, 0, w, w);
                ctx.strokeStyle = color;
                ctx.lineWidth = 10;
                ctx.strokeRect(5, 5, w - 10, w - 10);
                ctx.fillStyle = color;
                ctx.font = '900 76px Orbitron, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(k + 1), w / 2, w / 2 + 4);
            }),
            transparent: true,
        }));
        const side = k % 2 ? -1 : 1;
        const base = new THREE.Vector3(side * (1 + Math.random() * 2.2), 5.4 + Math.random() * 2.4, 1 - k * 5.4);
        mesh.position.copy(base);
        scene.add(mesh);
        return { mesh, base, phase: Math.random() * Math.PI * 2 };
    });

    const lineGeo = new THREE.BufferGeometry().setFromPoints(tiles.map((t) => t.base));
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#9fb4ff', transparent: true, opacity: 0.55 }));
    line.frustumCulled = false;
    const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', depthWrite: false }));
    spark.scale.set(0.4, 0.4, 1);
    scene.add(line, spark);
    const attr = lineGeo.attributes.position;

    return (time) => {
        const u = (time * 0.7) % (tiles.length - 1);
        tiles.forEach((t, k) => {
            t.mesh.position.y = t.base.y + Math.sin(time * 0.8 + t.phase) * 0.25;
            t.mesh.rotation.y = time * 0.4 + t.phase;
            t.mesh.rotation.x = Math.sin(time * 0.5 + t.phase) * 0.25;
            // Tiles swell as the spark passes through them
            t.mesh.scale.setScalar(1 + 0.25 * Math.exp(-((u - k) ** 2) * 6));
            attr.setXYZ(k, t.mesh.position.x, t.mesh.position.y, t.mesh.position.z);
        });
        attr.needsUpdate = true;
        const k = Math.floor(u);
        spark.position.lerpVectors(tiles[k].mesh.position, tiles[k + 1].mesh.position, u - k);
    };
}

// Air taxis crossing the sky with blinking navigation lights
function addTraffic(scene, glowTex) {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c2240, roughness: 0.3, metalness: 0.7 });
    const crafts = ['#46e8ff', '#ff4fd8', '#ffd166'].map((c, k) => {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new RoundedBoxGeometry(1.4, 0.32, 0.6, 2, 0.12), bodyMat);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.62), new THREE.MeshBasicMaterial({ color: c }));
        strip.position.y = 0.06;
        const under = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: c, depthWrite: false }));
        under.scale.set(2.4, 0.9, 1);
        under.position.y = -0.3;
        const red = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3b3b' }));
        red.position.x = -0.72;
        const white = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
        white.position.x = 0.72;
        g.add(body, strip, under, red, white);
        g.position.set(-40 + k * 27, 8.5 + k * 2.4, -8 - k * 13);
        scene.add(g);
        return { g, red, white, speed: 4 + k * 1.6, dir: k % 2 ? -1 : 1, k, baseY: g.position.y };
    });

    return (time, dt) => {
        crafts.forEach((c) => {
            c.g.position.x += c.dir * c.speed * dt;
            if (c.g.position.x > 45) c.g.position.x = -45;
            if (c.g.position.x < -45) c.g.position.x = 45;
            c.g.position.y = c.baseY + Math.sin(time * 1.2 + c.k) * 0.15;
            c.red.visible = (time + c.k * 0.3) % 1.2 < 0.15;
            c.white.visible = (time + c.k * 0.3 + 0.6) % 1.2 < 0.15;
        });
    };
}

// Light rain falling around the camera
function addRain(scene, camera, count) {
    const pos = new Float32Array(count * 6);
    const drops = Array.from({ length: count }, () => ({
        x: (Math.random() - 0.5) * 24, y: Math.random() * 14, z: -Math.random() * 30, v: 14 + Math.random() * 6,
    }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color: 0x9fb4ff, transparent: true, opacity: 0.35, depthWrite: false,
    }));
    rain.frustumCulled = false;
    scene.add(rain);

    return (time, dt) => {
        const cz = camera.position.z;
        drops.forEach((d, j) => {
            d.y -= d.v * dt;
            // Keep the drops in a box that travels with the camera
            if (d.y < 0 || d.z > cz + 3 || d.z < cz - 30) {
                d.y = 10 + Math.random() * 4;
                d.x = camera.position.x + (Math.random() - 0.5) * 24;
                d.z = cz + 3 - Math.random() * 33;
            }
            const o = j * 6;
            pos[o] = d.x; pos[o + 1] = d.y; pos[o + 2] = d.z;
            pos[o + 3] = d.x + 0.04; pos[o + 4] = d.y + 0.38; pos[o + 5] = d.z;
        });
        geo.attributes.position.needsUpdate = true;
    };
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
