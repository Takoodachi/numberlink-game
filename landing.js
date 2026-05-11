(function () {
    'use strict';

    var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    );
    if (isMobile) return;

    window.addEventListener('load', function () {
        initLanding();
    });

    function initHeroCanvas() {
        var hero = document.getElementById('hero-section');
        var canvas = document.getElementById('hero-canvas');
        if (!canvas || !hero) return;

        var ctx = canvas.getContext('2d');
        var CELL = 52;
        var cells = {};
        var running = true;

        function resize() {
            canvas.width  = hero.offsetWidth;
            canvas.height = hero.offsetHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        var snake = [];
        var maxSnakeLength = 8;

        hero.addEventListener('mousemove', function (e) {
            var rect = hero.getBoundingClientRect();
            var mx = e.clientX - rect.left;
            var my = e.clientY - rect.top;
            var cx = Math.floor(mx / CELL);
            var cy = Math.floor(my / CELL);
            var hue = (cx * 37 + cy * 23 + Date.now() * 0.03) % 360;
            cells[cx + ',' + cy] = { h: hue, s: 65, l: 62, a: 0.55 };
            var nb = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
            nb.forEach(function (d) {
                var k = (cx + d[0]) + ',' + (cy + d[1]);
                if (!cells[k] || cells[k].a < 0.22) cells[k] = { h: hue, s: 55, l: 68, a: 0.22 };
            });

            mouseTarget = { x: cx * CELL, y: cy * CELL };
            clearTimeout(mouseIdleTimer);
            mouseIdleTimer = setTimeout(function() {
                mouseTarget = null;
                snake = [];
                gridBoxes.forEach(function(b) {
                    b.attached = false;
                    if (canvas.width > 0) {
                        b.bx = Math.floor(Math.random() * (canvas.width / CELL)) * CELL;
                        b.by = Math.floor(Math.random() * (canvas.height / CELL)) * CELL;
                    }
                });
            }, 2000);
        });

        hero.addEventListener('mouseleave', function() {
            mouseTarget = null;
            clearTimeout(mouseIdleTimer);
            snake = [];
            gridBoxes.forEach(function(b) {
                b.attached = false;
                if (canvas.width > 0) {
                    b.bx = Math.floor(Math.random() * (canvas.width / CELL)) * CELL;
                    b.by = Math.floor(Math.random() * (canvas.height / CELL)) * CELL;
                }
            });
        });

        var gridBoxes = [];
        var numBoxes = 40;
        for(var i=0; i<numBoxes; i++) {
            gridBoxes.push({
                x: 0, y: 0, bx: 0, by: 0, 
                hue: Math.floor(Math.random() * 360), 
                initialized: false,
                attached: false
            });
        }

        var mouseTarget = null;
        var mouseIdleTimer = null;

        function render() {
            if (!running) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw interactive grid cells
            var keys = Object.keys(cells);
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                var c = cells[k];
                c.a *= 0.95;
                if (c.a < 0.008) { delete cells[k]; continue; }
                var p = k.split(',');
                ctx.fillStyle = 'hsla(' + c.h + ',' + c.s + '%,' + c.l + '%,' + c.a + ')';
                ctx.fillRect(parseInt(p[0]) * CELL, parseInt(p[1]) * CELL, CELL, CELL);
            }

            // Handle snake attachment logic
            if (mouseTarget) {
                for(var i=0; i<gridBoxes.length; i++) {
                    var b = gridBoxes[i];
                    if (!b.attached) {
                        var dxMouse = b.x - mouseTarget.x;
                        var dyMouse = b.y - mouseTarget.y;
                        var distMouse = Math.sqrt(dxMouse*dxMouse + dyMouse*dyMouse);
                        
                        if (distMouse < CELL * 1.5) {
                            b.attached = true;
                            snake.unshift(b); // New box becomes the head!
                            
                            if (snake.length > maxSnakeLength) {
                                var dropped = snake.pop();
                                dropped.attached = false;
                                dropped.bx = Math.floor(Math.random() * (canvas.width / CELL)) * CELL;
                                dropped.by = Math.floor(Math.random() * (canvas.height / CELL)) * CELL;
                            }
                        }
                    }
                }
            }

            // Draw colored grid boxes
            for(var i=0; i<gridBoxes.length; i++) {
                var b = gridBoxes[i];
                if (!b.initialized && canvas.width > 0) {
                    b.bx = Math.floor(Math.random() * (canvas.width / CELL)) * CELL;
                    b.by = Math.floor(Math.random() * (canvas.height / CELL)) * CELL;
                    b.x = b.bx;
                    b.y = b.by;
                    b.initialized = true;
                }
                
                var targetX = b.bx;
                var targetY = b.by;
                
                if (b.attached && mouseTarget) {
                    var snakeIdx = snake.indexOf(b);
                    if (snakeIdx === 0) {
                        targetX = mouseTarget.x;
                        targetY = mouseTarget.y;
                    } else {
                        var prev = snake[snakeIdx - 1];
                        var dx = b.x - prev.x;
                        var dy = b.y - prev.y;
                        var dist = Math.sqrt(dx*dx + dy*dy);
                        if (dist > 0) {
                            // Target a position CELL distance behind the previous segment
                            targetX = prev.x + (dx/dist) * CELL;
                            targetY = prev.y + (dy/dist) * CELL;
                        } else {
                            targetX = prev.x;
                            targetY = prev.y;
                        }
                    }
                }
                
                // Smooth interpolation towards target
                var speed = b.attached ? 0.25 : 0.04;
                b.x += (targetX - b.x) * speed;
                b.y += (targetY - b.y) * speed;
                
                // Render snapped to grid
                var rx = Math.round(b.x / CELL) * CELL;
                var ry = Math.round(b.y / CELL) * CELL;
                
                ctx.fillStyle = 'hsla(' + b.hue + ', 70%, 60%, 0.3)';
                ctx.fillRect(rx, ry, CELL, CELL);
                
                // Draw connecting lines between nearby boxes
                for(var j=i+1; j<gridBoxes.length; j++) {
                    var b2 = gridBoxes[j];
                    var r2x = Math.round(b2.x / CELL) * CELL;
                    var r2y = Math.round(b2.y / CELL) * CELL;
                    
                    var dx = rx - r2x;
                    var dy = ry - r2y;
                    var dist = Math.sqrt(dx*dx + dy*dy);
                    
                    if(dist > 0 && dist < CELL * 4.5) {
                        ctx.beginPath();
                        ctx.moveTo(rx + CELL/2, ry + CELL/2);
                        ctx.lineTo(r2x + CELL/2, r2y + CELL/2);
                        ctx.strokeStyle = 'hsla(' + b.hue + ', 70%, 60%, ' + (0.3 - dist/(CELL*4.5)*0.3) + ')';
                        ctx.lineWidth = 2;
                        ctx.stroke();
                    }
                }
            }

            requestAnimationFrame(render);
        }
        render();

        var obs = new IntersectionObserver(function (entries) {
            running = entries[0].isIntersecting;
            if (running) render();
        }, { threshold: 0 });
        obs.observe(hero);
    }

    // Split heading text into animatable characters
    function splitHeading(el) {
        var original = el.textContent;
        el.setAttribute('aria-label', original);
        el.innerHTML = original.split('').map(function (ch) {
            if (ch === ' ') return '<span class="ch" aria-hidden="true" style="display:inline-block">&nbsp;</span>';
            return '<span class="ch" aria-hidden="true" style="display:inline-block">' + ch + '</span>';
        }).join('');
        return el.querySelectorAll('.ch');
    }

    // Main init
    function initLanding() {
        var prefersReducedMotion =
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

        initHeroCanvas();

        var authBtn = document.getElementById('auth-btn');
        var levelBtn = document.getElementById('level-panel-btn');

        // Auth button visibility: show on hero, hide on modes/howtoplay,
        // show again on game section
        if (authBtn) {
            ScrollTrigger.create({
                trigger: '#modes-section',
                start: 'top 80%',
                end: 'bottom top',
                onEnter:      function () { authBtn.classList.add('hidden-offscreen'); },
                onLeave:      function () { authBtn.classList.remove('hidden-offscreen'); },
                onEnterBack:  function () { authBtn.classList.add('hidden-offscreen'); },
                onLeaveBack:  function () { authBtn.classList.remove('hidden-offscreen'); },
            });
        }

        // Levels button visibility: only show when game section is in view
        if (levelBtn) {
            levelBtn.classList.add('hidden-offscreen');
            ScrollTrigger.create({
                trigger: '#game-section',
                start: 'top 80%',
                end: 'bottom top',
                onEnter:      function () { levelBtn.classList.remove('hidden-offscreen'); },
                onLeave:      function () { levelBtn.classList.add('hidden-offscreen'); },
                onEnterBack:  function () { levelBtn.classList.remove('hidden-offscreen'); },
                onLeaveBack:  function () { levelBtn.classList.add('hidden-offscreen'); },
            });
        }

        // Hero entrance
        if (!prefersReducedMotion) {
            var heroTL = gsap.timeline({ defaults: { ease: 'power3.out' } });
            heroTL
                .from('.hero-title',   { opacity: 0, y: 60, duration: 1.0 })
                .from('.hero-tagline', { opacity: 0, y: 35, duration: 0.75 }, '-=0.55')
                .from('.hero-ctas',    { opacity: 0, y: 22, duration: 0.65 }, '-=0.45');
        }

        // Hero exit: content drifts up as user scrolls
        if (!prefersReducedMotion) {
            gsap.to('.hero-content', {
                scrollTrigger: {
                    trigger: '#hero-section',
                    start: 'top top',
                    end: 'bottom top',
                    scrub: 1.2,
                },
                y: -80,
                opacity: 0,
                ease: 'none',
            });
        }

        // Character-by-character heading reveals
        document.querySelectorAll('.section-heading').forEach(function (el) {
            var chars = splitHeading(el);
            if (prefersReducedMotion) return;
            gsap.from(chars, {
                scrollTrigger: { trigger: el, start: 'top 84%' },
                opacity: 0,
                y: 28,
                rotateX: -80,
                stagger: { each: 0.028, from: 'start' },
                duration: 0.55,
                ease: 'back.out(2)',
                transformOrigin: '50% 100%',
            });
        });

        // Mode cards: stagger fade-up on scroll
        if (!prefersReducedMotion) {
            gsap.from('.mode-card', {
                scrollTrigger: { trigger: '#modes-section', start: 'top 75%' },
                opacity: 0,
                y: 50,
                duration: 0.6,
                stagger: { each: 0.1, from: 'start' },
                ease: 'power2.out',
            });
        }

        // How It Works: sticky notes drop in
        if (!prefersReducedMotion) {
            gsap.from('.step-card', {
                scrollTrigger: { trigger: '.steps-row', start: 'top 80%' },
                opacity: 0,
                y: -70,
                rotation: function (i) { return [-18, 22, -14][i] || 0; },
                duration: 0.7,
                stagger: { each: 0.2, from: 'start' },
                ease: 'bounce.out',
            });

            gsap.from('.howtoplay-cta', {
                scrollTrigger: { trigger: '.howtoplay-cta', start: 'top 90%' },
                opacity: 0, y: 20, duration: 0.5, ease: 'power2.out',
            });
        }

        // Game board entrance
        if (!prefersReducedMotion) {
            gsap.from('#game-section header', {
                scrollTrigger: { trigger: '#game-section', start: 'top 78%' },
                opacity: 0, y: -36, duration: 0.7, ease: 'power3.out',
            });

            gsap.from('#game-wrapper', {
                scrollTrigger: { trigger: '#game-section', start: 'top 68%' },
                opacity: 0, scale: 0.78, y: 55, duration: 1.0,
                ease: 'elastic.out(1, 0.6)',
            });

            gsap.from('#ui-controls', {
                scrollTrigger: { trigger: '#game-section', start: 'top 55%' },
                opacity: 0, y: 28, duration: 0.65, ease: 'power2.out',
            });
        }

        // Mode card 3D tilt + dynamic spotlight on hover
        document.querySelectorAll('.mode-card').forEach(function (card) {
            card.addEventListener('mousemove', function (e) {
                var rect = card.getBoundingClientRect();
                var x = (e.clientX - rect.left) / rect.width - 0.5;
                var y = (e.clientY - rect.top) / rect.height - 0.5;
                card.style.transform =
                    'perspective(700px) rotateY(' + (x * 14) + 'deg) rotateX(' + (-y * 14) + 'deg) scale(1.04)';
                
                // Spotlight effect
                var xp = e.clientX - rect.left;
                var yp = e.clientY - rect.top;
                card.style.setProperty('--mouse-x', xp + 'px');
                card.style.setProperty('--mouse-y', yp + 'px');
            });
            card.addEventListener('mouseleave', function () {
                card.style.transform = '';
            });
        });

        // Magnetic Buttons
        var magneticBtns = document.querySelectorAll('.hero-play-btn, .hero-scroll-btn, .mode-card-play-btn');
        magneticBtns.forEach(function(btn) {
            btn.addEventListener('mousemove', function(e) {
                var rect = btn.getBoundingClientRect();
                var x = e.clientX - rect.left - rect.width / 2;
                var y = e.clientY - rect.top - rect.height / 2;
                gsap.to(btn, {
                    x: x * 0.3,
                    y: y * 0.3,
                    duration: 0.4,
                    ease: "power2.out"
                });
            });
            btn.addEventListener('mouseleave', function() {
                gsap.to(btn, {
                    x: 0,
                    y: 0,
                    duration: 0.7,
                    ease: "elastic.out(1, 0.3)"
                });
            });
        });

        // Scroll helpers
        function scrollToGame() {
            gsap.to(window, {
                scrollTo: { y: '#game-section', offsetY: 0 },
                duration: 1.1, ease: 'power2.inOut',
            });
        }

        function scrollToModes() {
            gsap.to(window, {
                scrollTo: { y: '#modes-section', offsetY: 30 },
                duration: 0.9, ease: 'power2.inOut',
            });
        }

        // CTA handlers
        var heroPlayBtn   = document.getElementById('hero-play-btn');
        var heroScrollBtn = document.getElementById('hero-scroll-btn');
        var howtoPlayBtn  = document.getElementById('howtoplay-play-btn');

        if (heroPlayBtn)   heroPlayBtn.addEventListener('click', scrollToGame);
        if (heroScrollBtn) heroScrollBtn.addEventListener('click', scrollToModes);
        if (howtoPlayBtn)  howtoPlayBtn.addEventListener('click', scrollToGame);

        // Mode card play buttons
        document.querySelectorAll('.mode-card').forEach(function (card) {
            card.querySelector('.mode-card-play-btn').addEventListener('click', function (e) {
                e.stopPropagation();
                var mode = card.dataset.mode;
                if (window.game && typeof window.game.setGameMode === 'function') {
                    window.game.setGameMode(mode);
                    scrollToGame();
                } else {
                    var attempts = 0;
                    var retry = setInterval(function () {
                        attempts++;
                        if (window.game && typeof window.game.setGameMode === 'function') {
                            clearInterval(retry);
                            window.game.setGameMode(mode);
                            scrollToGame();
                        } else if (attempts > 50) clearInterval(retry);
                    }, 80);
                }
            });
        });
    }
})();
