import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-analytics.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    sendPasswordResetEmail,
    verifyBeforeUpdateEmail,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyACoE3UwOfESN1o_GPPATdN_mmtjomMiL8",
    authDomain: "numberlink-73560.firebaseapp.com",
    projectId: "numberlink-73560",
    storageBucket: "numberlink-73560.firebasestorage.app",
    messagingSenderId: "689648695062",
    appId: "1:689648695062:web:cae517808fcc47eae5c237",
    measurementId: "G-NMVN4KL7KF"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

class Game {
    constructor() {
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (this.isMobile) {
            document.body.classList.add('mobile-layout');
            document.documentElement.classList.add('mobile-layout');
        } else {
            document.getElementById('carousel-overlay').classList.add('hidden');
        }

        this.splashStartTime = Date.now();
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.wrapper = document.getElementById('game-wrapper');
        this.confettiCanvas = document.getElementById('confetti-canvas');
        this.confettiCtx = this.confettiCanvas.getContext('2d');

        this.hints = 2;
        this.gridSize = 5;
        this.currentLevelIndex = 0;
        this.maxUnlockedIndex = 0;
        this.maxNumber = 0;
        this.streak = 0;
        this.speedrunStartTime = 0;
        this.speedrunCurrentTime = 0;
        this.currentWordLevelIndex = 0;
        this.maxUnlockedWordIndex = 0;
        this.currentObstacleLevelIndex = 0;
        this.maxUnlockedObstacleIndex = 0;
        this.lastScrollTop = 0;
        this.currentWordString = '';
        this.devEmail = 'luongdtran06@gmail.com';
        this.currentMode = 'classic';

        this.confettiParticles = [];
        this.allLevels = [];
        this.grid = [];
        this.solutionPath = [];
        this.userLines = [];
        this.wordLevels = [];
        this.obstacleLevels = [];
        this.obstacleWalls = [];
        this.obstacleTeleporters = [];
        this.obstacleTPGlowPhase = 0;
        this.obstacleGlowRAF = null;
        this.obstacleHintPts = null;
        this.numberIndices = {};
        this.speedrunBestTimes = {};
        this.optimalBestScores = {};

        this.isDevMode = false;
        this.isCelebrating = false;
        this.isDrawing = false;
        this.isDarkMode = false;
        this.isWinning = false;
        this.hasPromptedLogin = false;
        this.isSpeedrunActive = false;
        this.isLoginMode = true;
        this.carouselCanDismiss = false;
        this.lastLoginDate = null;
        this.currentUser = null;
        this.searchTimeout = null;
        this.currentDragLine = null;
        this.lastMoveCell = null;
        this.lastHintDate = null;

        this.colors = ['#6d28d9', '#ef4444', '#059669', '#2563eb', '#db2777', '#d97706', '#0891b2'];

        this.settings = this.loadSettings();

        this.initEventListeners();
        this.initCursorEffect();
        this.initSettings();

        this.initLevelPanel();
        this.initRulesModal();
        this.bindInputs();
        this.initTheme();
        this.checkOrientation();
        this.fetchLevels();
        this.initAuth();
        this.initContact();
        this.initCarousel();
        this.fetchWordLevels();
        this.fetchObstacleLevels();
    }

    initEventListeners() {
        document.getElementById('btn-undo').onclick = () => this.undo();
        document.getElementById('btn-hint').onclick = () => this.useHint();
        document.getElementById('btn-reset').onclick = () => this.resetLevel();
        document.getElementById('theme-toggle').onclick = () => this.toggleTheme();

        this.isGameSectionVisible = false;
        const gameSection = document.getElementById('game-section');
        if (gameSection) {
            new IntersectionObserver(
                ([entry]) => { this.isGameSectionVisible = entry.isIntersecting; },
                { threshold: 0.1 }
            ).observe(gameSection);
        }

        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.checkOrientation();
        });

        const authBtn = document.getElementById('auth-btn');

        const wordSidebar = document.getElementById('word-def-sidebar');
        document.getElementById('close-word-def-btn').onclick = () => wordSidebar.classList.remove('open');
        document.addEventListener('click', (e) => {
            if (wordSidebar.classList.contains('open') && !wordSidebar.contains(e.target) && e.target.id !== 'btn-show-answer') {
                wordSidebar.classList.remove('open');
            }
        });

        authBtn.onclick = () => {
            this.toggleAuth();
        };

        const titleRow = document.querySelector('.title-row');
        if (titleRow) {
            titleRow.onclick = () => this.openCarousel();
        }

        document.getElementById('close-auth-btn').onclick = () => document.getElementById('auth-modal').classList.remove('open');
        document.getElementById('auth-submit-btn').onclick = () => this.handleAuthSubmit();
        document.getElementById('auth-toggle-text').onclick = () => this.toggleAuthMode();
        document.getElementById('auth-modal').addEventListener('click', (e) => {
            if (e.target.id === 'auth-modal') e.target.classList.remove('open');
        });

        document.getElementById('close-profile-btn').onclick = () => document.getElementById('profile-modal').classList.remove('open');
        document.getElementById('profile-modal').addEventListener('click', (e) => {
            if (e.target.id === 'profile-modal') e.target.classList.remove('open');
        });
        document.getElementById('profile-logout-btn').onclick = () => this.handleLogout();
        document.getElementById('profile-reset-pwd').onclick = () => this.handlePasswordReset();

        document.getElementById('profile-change-email').onclick = () => this.openChangeEmailModal();
        document.getElementById('close-change-email-btn').onclick = () => document.getElementById('change-email-modal').classList.remove('open');
        document.getElementById('submit-change-email-btn').onclick = () => this.submitEmailChange();
        document.getElementById('change-email-modal').addEventListener('click', (e) => {
            if (e.target.id === 'change-email-modal') e.target.classList.remove('open');
        });

        document.getElementById('level-panel-btn').onclick = () => this.openLevelPanel();
        document.getElementById('level-panel-search-btn').addEventListener('click', () => this.executePanelSearch());
        document.getElementById('level-panel-search-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.executePanelSearch();
        });
        const levelPanelGrid = document.getElementById('level-panel-grid');
        levelPanelGrid.addEventListener('scroll', () => {
            const currentScrollTop = levelPanelGrid.scrollTop;
            this.lastScrollTop = currentScrollTop <= 0 ? 0 : currentScrollTop;
        });
        document.getElementById('close-level-panel-btn').onclick = () => this.closeLevelPanel();
        document.getElementById('close-level-btn').onclick = () => this.closeLevelModal();
        document.getElementById('level-modal').addEventListener('click', (e) => {
            if (e.target.id === 'level-modal') this.closeLevelModal();
        });

        document.getElementById('close-promo-btn').onclick = () => document.getElementById('promo-modal').classList.remove('open');
        document.getElementById('btn-promo-guest').onclick = () => document.getElementById('promo-modal').classList.remove('open');
        document.getElementById('btn-promo-login').onclick = () => {
            document.getElementById('promo-modal').classList.remove('open');
            this.toggleAuth();
        };
        document.getElementById('promo-modal').addEventListener('click', (e) => {
            if (e.target.id === 'promo-modal') e.target.classList.remove('open');
        });

        if (!this.isMobile) {
            document.querySelectorAll('.game-btn').forEach(btn => {
                btn.addEventListener('mousemove', (e) => {
                    const rect = btn.getBoundingClientRect();
                    const x = (e.clientX - rect.left - rect.width / 2) * 0.2;
                    const y = (e.clientY - rect.top - rect.height / 2) * 0.2;
                    btn.style.setProperty('--mag-x', x + 'px');
                    btn.style.setProperty('--mag-y', y + 'px');
                });
                btn.addEventListener('mouseleave', () => {
                    btn.style.removeProperty('--mag-x');
                    btn.style.removeProperty('--mag-y');
                });
            });
        }
    }

    initCursorEffect() {
        if (this.isMobile) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const dot = document.createElement('div');
        dot.id = 'cursor-dot';
        document.body.appendChild(dot);
        this.cursorDot = dot;

        const trailCanvas = document.createElement('canvas');
        trailCanvas.id = 'cursor-trail-canvas';
        document.body.appendChild(trailCanvas);
        this.cursorTrailCanvas = trailCanvas;
        const trailCtx = trailCanvas.getContext('2d');

        const resize = () => {
            trailCanvas.width = window.innerWidth;
            trailCanvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        const BLOCK = 15;
        const SPACING = 18;
        const MAX_TRAIL = 14;
        const FADE_DELAY = 300;
        const FADE_DURATION = 500;

        let mouseX = -500, mouseY = -500;
        let trail = [];
        let lastSampledX = -9999, lastSampledY = -9999;
        let isVisible = false;
        let lastMoveTime = 0;

        let accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4f46e5';
        new MutationObserver(() => {
            accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4f46e5';
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
            lastMoveTime = Date.now();
            dot.style.left = mouseX + 'px';
            dot.style.top = mouseY + 'px';

            if (!isVisible) {
                isVisible = true;
                dot.classList.add('visible');
                lastSampledX = mouseX;
                lastSampledY = mouseY;
            }

            const dx = mouseX - lastSampledX;
            const dy = mouseY - lastSampledY;
            if (dx * dx + dy * dy >= SPACING * SPACING) {
                trail.unshift({ x: mouseX, y: mouseY });
                if (trail.length > MAX_TRAIL) trail.length = MAX_TRAIL;
                lastSampledX = mouseX;
                lastSampledY = mouseY;
            }
        });

        document.addEventListener('mouseleave', () => {
            isVisible = false;
            dot.classList.remove('visible');
            trail = [];
            lastSampledX = -9999;
            lastSampledY = -9999;
        });

        const render = () => {
            trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

            if (isVisible && trail.length > 0) {
                const idle = Date.now() - lastMoveTime;
                const idleFade = idle < FADE_DELAY ? 1
                    : Math.max(0, 1 - (idle - FADE_DELAY) / FADE_DURATION);

                if (idleFade > 0) {
                    trailCtx.fillStyle = accentColor;
                    trail.forEach((p, i) => {
                        const t = 1 - (i + 1) / (MAX_TRAIL + 1);
                        trailCtx.globalAlpha = t * 0.8 * idleFade;
                        const size = Math.round(BLOCK * (0.45 + t * 0.55));
                        trailCtx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
                    });
                    trailCtx.globalAlpha = 1;
                }
            }

            requestAnimationFrame(render);
        };
        render();

        const interactable = 'button, a, .level-indicator, .auth-toggle span, .contact-corner, .lvl-btn, .tab-btn, .title-row';
        document.addEventListener('mouseover', (e) => {
            if (e.target.closest(interactable)) dot.classList.add('cursor-hover');
        });
        document.addEventListener('mouseout', (e) => {
            if (e.target.closest(interactable)) dot.classList.remove('cursor-hover');
        });
    }

    // Authentication Methods
    initAuth() {
        const authBtn = document.getElementById('auth-btn');
        const sidebarAuthBtn = document.getElementById('sidebar-auth-trigger');

        authBtn.innerText = this.isMobile ? "Profile" : "Profile / Settings";

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                if (!user.emailVerified) {
                    await signOut(auth);
                    this.currentUser = null;
                    this.isDevMode = false;
                    if (sidebarAuthBtn) sidebarAuthBtn.innerText = "Login / Register";
                    await this.loadProgress();
                    return;
                }

                this.currentUser = user;
                this.isDevMode = (user.email === this.devEmail);
                if (sidebarAuthBtn) sidebarAuthBtn.innerText = "Profile / Settings";
                await this.loadProgress();
            } else {
                this.currentUser = null;
                this.isDevMode = false;
                if (sidebarAuthBtn) sidebarAuthBtn.innerText = "Login / Register";
                await this.loadProgress();

                const today = new Date();
                const isMonday = today.getDay() === 1;
                const todayString = today.toDateString();
                const lastPromptedDate = localStorage.getItem('lastPromoMonday');
                const hasSeenInitialPromo = localStorage.getItem('hasSeenInitialPromo');

                let shouldShowPromo = false;

                if (!hasSeenInitialPromo && !this.hasPromptedLogin) {
                    shouldShowPromo = true;
                    localStorage.setItem('hasSeenInitialPromo', 'true');
                    localStorage.setItem('lastPromoMonday', todayString);
                }
                else if (isMonday && lastPromptedDate !== todayString && !this.hasPromptedLogin) {
                    shouldShowPromo = true;
                    localStorage.setItem('lastPromoMonday', todayString);
                }

                if (shouldShowPromo) {
                    this.hasPromptedLogin = true;

                    setTimeout(() => {
                        const promoModal = document.getElementById('promo-modal');
                        if (promoModal) promoModal.classList.add('open');
                    }, 100);
                }
            }
        });
    }

    toggleAuthMode() {
        this.isLoginMode = !this.isLoginMode;
        const title = document.getElementById('auth-title');
        const submitBtn = document.getElementById('auth-submit-btn');
        const toggleText = document.getElementById('auth-toggle-text');
        const errorText = document.getElementById('auth-error');

        errorText.innerText = "";

        if (this.isLoginMode) {
            title.innerText = "Login";
            submitBtn.innerText = "Login";
            toggleText.innerHTML = "Don't have an account? <span>Register</span>";
        } else {
            title.innerText = "Register";
            submitBtn.innerText = "Register";
            toggleText.innerHTML = "Already have an account? <span>Login</span>";
        }
    }

    toggleAuth() {
        if (this.currentUser) {
            document.getElementById('profile-email').innerText = this.currentUser.email;

            const lvlString = this.allLevels[this.currentLevelIndex] ? this.allLevels[this.currentLevelIndex].id : this.currentLevelIndex + 1;
            document.getElementById('profile-level').innerText = lvlString;

            document.getElementById('profile-modal').classList.add('open');
        } else {
            this.isLoginMode = true;
            document.getElementById('auth-title').innerText = "Login";
            document.getElementById('auth-submit-btn').innerText = "Login";
            document.getElementById('auth-toggle-text').innerHTML = "Don't have an account? <span>Register</span>";

            document.getElementById('auth-email').value = "";
            document.getElementById('auth-password').value = "";
            document.getElementById('auth-error').innerText = "";

            document.getElementById('auth-modal').classList.add('open');
        }
    }

    handleLogout() {
        signOut(auth);
        document.getElementById('profile-modal').classList.remove('open');
    }

    formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const milliseconds = Math.floor((ms % 1000) / 10);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    }

    openChangeEmailModal() {
        if (!this.currentUser) return;

        document.getElementById('new-email-input').value = "";
        document.getElementById('confirm-email-checkbox').checked = false;

        const errorText = document.getElementById('change-email-error');
        errorText.innerText = "";
        errorText.style.color = "#ef4444";

        document.getElementById('profile-modal').classList.remove('open');
        document.getElementById('change-email-modal').classList.add('open');
    }

    async submitEmailChange() {
        if (!this.currentUser) return;

        const newEmail = document.getElementById('new-email-input').value.trim();
        const isConfirmed = document.getElementById('confirm-email-checkbox').checked;
        const errorText = document.getElementById('change-email-error');

        if (!newEmail) {
            errorText.innerText = "Please enter a new email address.";
            return;
        }
        if (!isConfirmed) {
            errorText.innerText = "Please check the box to confirm.";
            return;
        }
        if (newEmail === this.currentUser.email) {
            errorText.innerText = "This is already your current email.";
            return;
        }

        errorText.style.color = "";
        errorText.innerText = "Processing...";

        try {
            await verifyBeforeUpdateEmail(this.currentUser, newEmail);

            errorText.style.color = "#059669";
            errorText.innerText = `Success! A verification link has been sent to ${newEmail}.`;

            setTimeout(() => {
                document.getElementById('change-email-modal').classList.remove('open');
            }, 3000);

        } catch (error) {
            errorText.style.color = "#ef4444";
            if (error.code === 'auth/requires-recent-login') {
                errorText.innerText = "For security, please log out and log back in before changing your email.";
            } else if (error.code === 'auth/invalid-email') {
                errorText.innerText = "Please enter a valid email address.";
            } else if (error.code === 'auth/email-already-in-use') {
                errorText.innerText = "That email is already registered to another account.";
            } else {
                errorText.innerText = error.message;
            }
        }
    }

    async handlePasswordReset() {
        if (!this.currentUser) return;

        try {
            await sendPasswordResetEmail(auth, this.currentUser.email);
            alert(`A password reset link has been sent to ${this.currentUser.email}`);
        } catch (error) {
            alert("Error sending reset email: " + error.message);
        }
    }

    async handleAuthSubmit() {
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        const errorText = document.getElementById('auth-error');

        if (!email || !password) {
            errorText.innerText = "Please fill out all fields.";
            return;
        }

        errorText.innerText = "Processing...";
        errorText.style.color = "";

        try {
            if (this.isLoginMode) {
                const userCred = await signInWithEmailAndPassword(auth, email, password);

                if (!userCred.user.emailVerified) {
                    await signOut(auth);
                    errorText.style.color = "#ef4444";
                    errorText.innerText = "Please verify your email before logging in.";
                    return;
                }

                document.getElementById('auth-modal').classList.remove('open');
            } else {
                const userCred = await createUserWithEmailAndPassword(auth, email, password);

                await sendEmailVerification(userCred.user);
                await signOut(auth);

                this.isLoginMode = true;
                document.getElementById('auth-title').innerText = "Login";
                document.getElementById('auth-submit-btn').innerText = "Login";
                document.getElementById('auth-toggle-text').innerHTML = "Don't have an account? <span>Register</span>";

                errorText.style.color = "#059669";
                errorText.innerText = "Account created! Please check your email to verify.";
            }
        } catch (error) {
            errorText.style.color = "#ef4444";

            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
                errorText.innerText = "This account does not exist. Please register.";
            } else if (error.code === 'auth/wrong-password') {
                errorText.innerText = "Incorrect password.";
            } else if (error.code === 'auth/email-already-in-use') {
                errorText.innerText = "An account with this email already exists.";
            } else if (error.code === 'auth/weak-password') {
                errorText.innerText = "Password must be at least 6 characters.";
            } else if (error.code === 'auth/invalid-email') {
                errorText.innerText = "Please enter a valid email address.";
            } else {
                errorText.innerText = error.message;
            }
        }
    }

    // Cloud Save and Load Methods
    async loadProgress() {
        const saved = localStorage.getItem('linkGameData');
        if (saved) {
            const data = JSON.parse(saved);
            this.currentLevelIndex = data.currentLevelIndex || 0;
            this.maxUnlockedIndex = data.maxUnlockedIndex || 0;
            this.streak = data.streak || 0;
            this.currentWordLevelIndex = data.currentWordLevelIndex || 0;
            this.maxUnlockedWordIndex = data.maxUnlockedWordIndex || 0;
            this.currentObstacleLevelIndex = data.currentObstacleLevelIndex || 0;
            this.maxUnlockedObstacleIndex = data.maxUnlockedObstacleIndex || 0;
            this.currentMode = data.currentMode || 'classic';
            this.hints = data.hints !== undefined ? data.hints : 2;
            this.lastHintDate = data.lastHintDate;
            this.lastLoginDate = data.lastLoginDate || null;
            this.speedrunBestTimes = data.speedrunBestTimes || {};
            this.optimalBestScores = data.optimalBestScores || {};
        }

        if (this.currentUser) {
            try {
                const docRef = doc(db, "users", this.currentUser.uid);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const cloudData = docSnap.data();

                    const localMax = this.maxUnlockedIndex || 0;
                    const cloudMax = cloudData.maxUnlockedIndex || 0;

                    if (localMax !== cloudMax) {
                        const choice = await this.askForConflictResolution(localMax, cloudMax);
                        if (choice === 'cloud') {
                            this.applyCloudData(cloudData);
                        } else {
                            this.saveProgress();
                            this.enforceSavedMode();
                        }
                    } else {
                        this.applyCloudData(cloudData);
                    }
                } else {
                    this.saveProgress();
                    this.enforceSavedMode();
                }
            } catch (e) {
                console.error("Error loading from cloud:", e);
                this.enforceSavedMode();
            }
        } else {
            this.enforceSavedMode();
        }

        this.checkDailyHint();
        this.checkDailyStreak();
    }

    async saveProgress() {
        const data = {
            currentLevelIndex: this.currentLevelIndex,
            maxUnlockedIndex: this.maxUnlockedIndex,
            hints: this.hints,
            lastHintDate: this.lastHintDate,
            streak: this.streak,
            lastLoginDate: this.lastLoginDate,
            speedrunBestTimes: this.speedrunBestTimes,
            optimalBestScores: this.optimalBestScores,
            currentWordLevelIndex: this.currentWordLevelIndex,
            maxUnlockedWordIndex: this.maxUnlockedWordIndex,
            currentObstacleLevelIndex: this.currentObstacleLevelIndex,
            maxUnlockedObstacleIndex: this.maxUnlockedObstacleIndex,
            currentMode: this.currentMode,
        };

        localStorage.setItem('linkGameData', JSON.stringify(data));
        this.updateUI();

        if (this.currentUser) {
            try {
                await setDoc(doc(db, "users", this.currentUser.uid), data);
            } catch (e) {
                console.error("Error saving to cloud:", e);
            }
        }
    }

    applyCloudData(cloudData) {
        this.currentLevelIndex = cloudData.currentLevelIndex;
        this.maxUnlockedIndex = cloudData.maxUnlockedIndex;
        this.hints = cloudData.hints;
        this.lastHintDate = cloudData.lastHintDate;
        this.streak = cloudData.streak || 0;
        this.currentWordLevelIndex = cloudData.currentWordLevelIndex || 0;
        this.maxUnlockedWordIndex = cloudData.maxUnlockedWordIndex || 0;
        this.currentObstacleLevelIndex = cloudData.currentObstacleLevelIndex || 0;
        this.maxUnlockedObstacleIndex = cloudData.maxUnlockedObstacleIndex || 0;
        this.lastLoginDate = cloudData.lastLoginDate || null;
        this.speedrunBestTimes = cloudData.speedrunBestTimes || {};
        this.optimalBestScores = cloudData.optimalBestScores || {};

        localStorage.setItem('linkGameData', JSON.stringify(cloudData));
        this.updateUI();
        this.loadLevel(this.currentLevelIndex);
        this.enforceSavedMode();
    }

    askForConflictResolution(localIndex, cloudIndex) {
        return new Promise((resolve) => {
            const modal = document.getElementById('conflict-modal');
            const localBtn = document.getElementById('btn-keep-local');
            const cloudBtn = document.getElementById('btn-keep-cloud');

            const localLvlString = this.allLevels[localIndex] ? `Level ${this.allLevels[localIndex].id}` : `Level ${localIndex + 1}`;
            const cloudLvlString = this.allLevels[cloudIndex] ? `Level ${this.allLevels[cloudIndex].id}` : `Level ${cloudIndex + 1}`;

            document.getElementById('conflict-local-text').innerText = localLvlString;
            document.getElementById('conflict-cloud-text').innerText = cloudLvlString;

            modal.classList.add('open');

            const handleLocal = () => { cleanup(); resolve('local'); };
            const handleCloud = () => { cleanup(); resolve('cloud'); };

            const cleanup = () => {
                modal.classList.remove('open');
                localBtn.removeEventListener('click', handleLocal);
                cloudBtn.removeEventListener('click', handleCloud);
            };

            localBtn.addEventListener('click', handleLocal);
            cloudBtn.addEventListener('click', handleCloud);
        });
    }

    // Level Selection Methods
    executeSearch() {
        const searchInput = document.getElementById('level-search');
        if (!searchInput) return;
        const searchTerm = searchInput.value.trim();
        const grid = document.getElementById('level-grid');
        if (!grid) return;
        for (let btn of grid.getElementsByClassName('lvl-btn')) {
            btn.style.display = (searchTerm === '' || btn.innerText.includes(searchTerm)) ? '' : 'none';
        }
    }

    openLevelModal() {
        // Kept for mobile compatibility — on mobile still uses center modal
        const modal = document.getElementById('level-modal');
        const grid = document.getElementById('level-grid');
        const searchInput = document.getElementById('level-search');
        const searchContainer = document.querySelector('.search-container');

        if (searchContainer) {
            if (this.currentMode === 'words' || this.currentMode === 'obstacles') {
                searchContainer.style.display = 'none';
            } else {
                searchContainer.style.display = 'flex';
                searchContainer.classList.remove('hidden');
            }
        }

        grid.scrollTop = 0;
        this.lastScrollTop = 0;
        grid.innerHTML = '';
        if (searchInput) searchInput.value = '';

        this.fillLevelGridInto(grid);
        modal.classList.add('open');
    }

    openLevelPanel() {
        const panel = document.getElementById('level-panel');
        const backdrop = document.getElementById('level-panel-backdrop');
        const grid = document.getElementById('level-panel-grid');
        const searchInput = document.getElementById('level-panel-search-input');
        const panelSearch = document.querySelector('.level-panel-search');

        if (panelSearch) {
            panelSearch.style.display = (this.currentMode === 'words' || this.currentMode === 'obstacles') ? 'none' : 'flex';
        }

        grid.scrollTop = 0;
        this.lastScrollTop = 0;
        grid.innerHTML = '';
        if (searchInput) searchInput.value = '';

        this.fillLevelGridInto(grid);
        panel.classList.add('open');
        if (backdrop) backdrop.classList.add('open');
    }

    fillLevelGridInto(grid) {
        const activeLevels = this.currentMode === 'words' ? this.wordLevels
                           : this.currentMode === 'obstacles' ? this.obstacleLevels
                           : this.allLevels;
        const activeMaxUnlocked = this.currentMode === 'words' ? this.maxUnlockedWordIndex
                                : this.currentMode === 'obstacles' ? this.maxUnlockedObstacleIndex
                                : this.maxUnlockedIndex;
        const activeCurrentIndex = this.currentMode === 'words' ? this.currentWordLevelIndex
                                 : this.currentMode === 'obstacles' ? this.currentObstacleLevelIndex
                                 : this.currentLevelIndex;

        if (!activeLevels || activeLevels.length === 0) {
            grid.innerHTML = '<p style="color:var(--text-color); padding:20px;">Levels loading...</p>';
            return;
        }

        const limit = this.isDevMode ? activeLevels.length : activeMaxUnlocked;

        for (let i = 0; i <= limit && i < activeLevels.length; i++) {
            const lvl = activeLevels[i];
            const btn = document.createElement('button');
            btn.innerText = lvl.id || (i + 1);
            btn.className = 'lvl-btn';
            if (i === activeCurrentIndex) btn.classList.add('active');
            btn.onclick = () => {
                this.loadLevel(i);
                this.closeLevelPanel();
            };
            grid.appendChild(btn);
        }
    }

    executePanelSearch() {
        const input = document.getElementById('level-panel-search-input');
        if (!input) return;
        const target = parseInt(input.value, 10);
        if (isNaN(target) || target < 1) return;

        const activeLevels = this.currentMode === 'words' ? this.wordLevels
                           : this.currentMode === 'obstacles' ? this.obstacleLevels
                           : this.allLevels;
        const idx = activeLevels.findIndex(l => (l.id || 0) === target);
        if (idx !== -1) {
            this.loadLevel(idx);
            this.closeLevelPanel();
        }
    }

    async fetchLevels() {
        try {
            const response = await fetch('levels.enc');
            if (!response.ok) throw new Error("Could not load levels");

            const encodedText = await response.text();

            const decodedText = atob(encodedText);
            this.allLevels = JSON.parse(decodedText);

            if (this.currentLevelIndex >= this.allLevels.length) {
                this.currentLevelIndex = this.allLevels.length - 1;
            }

            this.loadLevel(this.currentLevelIndex);

            const elapsedTime = Date.now() - this.splashStartTime;
            const remainingTime = Math.max(0, 1500 - elapsedTime);

            setTimeout(() => {
                this.removeSplashScreen();

                if (this.isMobile) {
                    setTimeout(() => {
                        this.showToast("For full features, play on a PC/Laptop! 💻", 4500);
                    }, 500);
                }
            }, remainingTime);

        } catch (error) {
            console.error(error);
            setTimeout(() => {
                if (this.allLevels.length === 0) alert("Please verify levels.enc is uploaded to GitHub.");
            }, 2000);
        }
    }

    async fetchWordLevels() {
        try {
            const response = await fetch('word_levels.enc');
            const encodedText = await response.text();

            const cleanText = encodedText.replace(/\s+/g, '');
            this.wordLevels = JSON.parse(atob(cleanText));

            if (this.currentMode === 'words') {
                this.loadLevel(this.currentWordLevelIndex);
            }
        } catch (error) {
            console.error("Failed to load word levels:", error);
        }
    }

    async fetchObstacleLevels() {
        try {
            const response = await fetch('obstacles.enc');
            const encodedText = await response.text();
            this.obstacleLevels = JSON.parse(atob(encodedText.replace(/\s+/g, '')));
            if (this.currentMode === 'obstacles') {
                this.loadLevel(this.currentObstacleLevelIndex);
            }
        } catch (error) {
            console.error("Failed to load obstacle levels:", error);
        }
    }

    loadLevel(index) {
        const uiControls = document.getElementById('ui-controls');
        if (uiControls) uiControls.style.display = 'flex';

        if (this.currentMode === 'obstacles') {
            this.currentObstacleLevelIndex = index;
            const level = this.obstacleLevels[index];
            if (!level) { this.grid = []; return; }

            this.gridSize = level.size;
            this.maxNumber = Math.max(...level.clues.map(c => c.val));
            this.solutionPath = level.solution;
            this.obstacleWalls = level.walls || [];
            this.obstacleTeleporters = level.teleporters || [];
            this.numberIndices = {};

            this.grid = Array.from({length: this.gridSize}, (_, r) =>
                Array.from({length: this.gridSize}, (_, c) => ({ r, c, val: null, type: 'empty' }))
            );
            for (const clue of level.clues) {
                this.grid[clue.r][clue.c] = { r: clue.r, c: clue.c, val: clue.val, type: 'fixed' };
                const pathIdx = this.solutionPath.findIndex(p => p.r === clue.r && p.c === clue.c);
                if (pathIdx !== -1) this.numberIndices[clue.val] = pathIdx;
            }

            this.userLines = [];
            this.currentDragLine = null;
            this.isWinning = false;
            this.startObstacleGlow();
            this.resizeCanvas();
            this.updateUI();
            this.boardEntranceAnimation();
            this.closeLevelPanel(); this.closeLevelModal();
            return;
        }

        if (this.currentMode === 'words') {
            this.currentWordLevelIndex = index;
            const level = this.wordLevels[index];
            if (!level) {
                this.grid = [];
                return;
            }

            if (this.isDevMode) {
                console.log(`Level ${index + 1} Valid Words:`, level.validWords);
            }

            this.gridSize = level.size;
            this.maxNumber = 2;
            this.numberIndices = {
                1: { r: level.startNode.r, c: level.startNode.c },
                2: { r: level.endNode.r, c: level.endNode.c }
            };

            this.grid = [];
            let flatIndex = 0;
            for (let r = 0; r < this.gridSize; r++) {
                const row = [];
                for (let c = 0; c < this.gridSize; c++) {
                    const letter = level.grid[flatIndex++];
                    const isStart = (r === level.startNode.r && c === level.startNode.c);
                    const isEnd = (r === level.endNode.r && c === level.endNode.c);

                    row.push({
                        r, c, letter,
                        type: (isStart || isEnd) ? 'fixed' : 'empty',
                        val: isStart ? 1 : (isEnd ? 2 : null)
                    });
                }
                this.grid.push(row);
            }

            this.userLines = [];
            this.currentDragLine = null;
            this.isWinning = false;
            this.currentWordString = "";
            this.resizeCanvas();
            this.updateUI();
            this.boardEntranceAnimation();
            this.closeLevelPanel(); this.closeLevelModal();
            return;
        }

        if (!this.allLevels || !this.allLevels[index]) return;

        this.currentLevelIndex = index;
        this.resetSpeedrun();
        const levelData = this.allLevels[index];

        this.gridSize = levelData.size;
        this.isWinning = false;
        this.userLines = [];
        this.currentDragLine = null;
        this.numberIndices = {};
        this.setRandomColor();
        this.grid = Array(this.gridSize).fill().map(() => Array(this.gridSize).fill({ val: null, type: 'empty' }));
        this.resizeCanvas();
        this.solutionPath = levelData.solution;

        let maxVal = 0;
        levelData.clues.forEach(clue => {
            this.grid[clue.r][clue.c] = { val: clue.val, type: 'fixed' };
            if (clue.val > maxVal) maxVal = clue.val;

            const pathIdx = this.solutionPath.findIndex(p => p.r === clue.r && p.c === clue.c);
            if (pathIdx !== -1) this.numberIndices[clue.val] = pathIdx;
        });

        this.maxNumber = maxVal;
        this.updateUI();
        this.boardEntranceAnimation();
        this.closeLevelPanel(); this.closeLevelModal();
    }

    boardEntranceAnimation() {
        let animCells;
        let staggerMs;
        if (this.currentMode === 'words') {
            animCells = [];
            for (let r = 0; r < this.gridSize; r++) {
                for (let c = 0; c < this.gridSize; c++) {
                    if (this.grid[r][c].letter) animCells.push({ r, c });
                }
            }
            staggerMs = 20;
        } else {
            animCells = [];
            for (let r = 0; r < this.gridSize; r++) {
                for (let c = 0; c < this.gridSize; c++) {
                    if (this.grid[r][c].type === 'fixed') {
                        animCells.push({ r, c, val: this.grid[r][c].val });
                    }
                }
            }
            animCells.sort((a, b) => a.val - b.val);
            staggerMs = 80;
        }

        animCells.forEach(({ r, c }) => {
            this.grid[r][c].animAlpha = 0;
            this.grid[r][c].animScale = 0.5;
        });

        this.draw();

        const animDuration = 200;
        const startTime = performance.now();

        const animate = (now) => {
            let anyActive = false;
            animCells.forEach(({ r, c }, i) => {
                const elapsed = now - (startTime + i * staggerMs);
                if (elapsed < 0) { anyActive = true; return; }
                const p = Math.min(elapsed / animDuration, 1);
                const ease = 1 - Math.pow(1 - p, 3);
                this.grid[r][c].animAlpha = ease;
                this.grid[r][c].animScale = 0.5 + 0.5 * ease;
                if (p < 1) anyActive = true;
            });
            this.draw();
            if (anyActive) {
                requestAnimationFrame(animate);
            } else {
                animCells.forEach(({ r, c }) => {
                    delete this.grid[r][c].animAlpha;
                    delete this.grid[r][c].animScale;
                });
                this.draw();
            }
        };
        requestAnimationFrame(animate);
    }

    closeLevelModal() { document.getElementById('level-modal').classList.remove('open'); }

    closeLevelPanel() {
        const panel = document.getElementById('level-panel');
        const backdrop = document.getElementById('level-panel-backdrop');
        if (panel) panel.classList.remove('open');
        if (backdrop) backdrop.classList.remove('open');
    }

    initLevelPanel() {
        const btn = document.getElementById('level-panel-btn');
        if (btn) btn.innerText = this.isMobile ? '☰' : '☰ Levels';

        // Inject backdrop element once
        if (!document.getElementById('level-panel-backdrop')) {
            const bd = document.createElement('div');
            bd.id = 'level-panel-backdrop';
            document.body.appendChild(bd);
            bd.addEventListener('click', () => this.closeLevelPanel());
        }
    }

    updateRulesUI() {
        const rulesContainer = document.getElementById('dynamic-rules-content');
        if (!rulesContainer) return;

        let rulesHTML = '';

        if (this.currentMode === 'classic') {
            rulesHTML += `<div class="rule-item"><div class="rule-icon">1-2-3</div><div class="rule-text">Connect the numbers in order: 1 → 2 → 3 → …</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">▧</div><div class="rule-text">Your path must fill every cell on the grid</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">≠</div><div class="rule-text">Paths cannot cross or overlap</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">🎮</div><div class="rule-text">${this.isMobile ? 'Drag from number to number' : 'Drag from number to number, or use arrow keys'}</div></div>`;
        } else if (this.currentMode === 'speedrun') {
            rulesHTML += `<div class="rule-item"><div class="rule-icon">⏱️</div><div class="rule-text">Same rules as Classic — but the clock is running!</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">1-2-3</div><div class="rule-text">Connect numbers in order and fill every cell</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">🏆</div><div class="rule-text">Your best time per level is saved to the leaderboard</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">🎮</div><div class="rule-text">${this.isMobile ? 'Drag from number to number' : 'Drag from number to number, or use arrow keys'}</div></div>`;
        } else if (this.currentMode === 'blindfold') {
            rulesHTML += `<div class="rule-item"><div class="rule-icon">❓</div><div class="rule-text">All numbers are hidden — connect them in order from memory</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">👁️</div><div class="rule-text">A correct connection reveals both endpoints; a wrong one stays hidden</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">▧</div><div class="rule-text">Fill every cell — paths cannot cross</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">🎮</div><div class="rule-text">${this.isMobile ? 'Drag from number to number' : 'Drag from number to number, or use arrow keys'}</div></div>`;
        } else if (this.currentMode === 'optimal') {
            rulesHTML += `<div class="rule-item"><div class="rule-icon">1-2-3</div><div class="rule-text">Connect numbers in order — but you do NOT need to fill every cell</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">📏</div><div class="rule-text">Use as few tiles as possible — your efficiency score is what matters</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">≠</div><div class="rule-text">Paths cannot cross or overlap</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">🎮</div><div class="rule-text">${this.isMobile ? 'Drag from number to number' : 'Drag from number to number, or use arrow keys'}</div></div>`;
        } else if (this.currentMode === 'words') {
            rulesHTML += `<div class="rule-item"><div class="rule-icon">A→Z</div><div class="rule-text">Trace a path from the highlighted start letter to the highlighted end letter</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">📖</div><div class="rule-text">The letters you pass through must spell a valid dictionary word</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">💡</div><div class="rule-text">Use "Show Answer" after solving to read the word's definition</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">🎮</div><div class="rule-text">${this.isMobile ? 'Drag from letter to letter' : 'Drag from letter to letter, or use arrow keys'}</div></div>`;
        } else if (this.currentMode === 'obstacles') {
            rulesHTML += `<div class="rule-item"><div class="rule-icon">⌨️</div><div class="rule-text">Use ↑ ↓ ← → or W A S D to move — no mouse or touch</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">1-2-3</div><div class="rule-text">Connect numbers in order and fill every cell</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">🧱</div><div class="rule-text">Thick borders are walls — your path cannot pass through them</div></div>`;
            rulesHTML += `<div class="rule-item"><div class="rule-icon">✨</div><div class="rule-text">Glowing icons are teleporters — step onto one to jump instantly to its paired partner (works from any direction)</div></div>`;
        }

        if (!this.isMobile) {
            rulesHTML += `
                <div class="rule-shortcuts">
                    <div class="shortcuts-title">Keyboard shortcuts</div>
                    <div class="shortcuts-grid">
                        <span class="shortcut-key">Ctrl Z</span><span class="shortcut-desc">Undo</span>
                        <span class="shortcut-key">Esc</span><span class="shortcut-desc">Cancel line</span>
                        <span class="shortcut-key">H</span><span class="shortcut-desc">Hint</span>
                        <span class="shortcut-key">R</span><span class="shortcut-desc">Reset level</span>
                    </div>
                </div>
            `;
        }

        rulesContainer.innerHTML = rulesHTML;
    }

    initRulesModal() {
        const rulesBtn = document.getElementById('rules-btn');
        const rulesModal = document.getElementById('rules-modal');
        const closeBtn = document.getElementById('close-rules-btn');

        this.updateRulesUI();

        rulesBtn.onclick = () => rulesModal.classList.add('open');
        closeBtn.onclick = () => rulesModal.classList.remove('open');

        rulesModal.addEventListener('click', (e) => {
            if (e.target.id === 'rules-modal') rulesModal.classList.remove('open');
        });

        if (!localStorage.getItem('linkGameHasVisited')) {
            rulesModal.classList.add('open');
            localStorage.setItem('linkGameHasVisited', 'true');
        }
    }

    // Game Methods
    resizeCanvas() {
        const maxWidth = Math.min(window.innerWidth * 0.92, 600);
        const maxHeight = window.innerHeight - 220;
        const wrapperSize = Math.floor(Math.min(maxWidth, maxHeight));

        this.wrapper.style.width = `${wrapperSize}px`;
        this.wrapper.style.height = `${wrapperSize}px`;

        const displaySize = wrapperSize - 5;
        const dpr = Math.max(1, window.devicePixelRatio || 1);

        this.canvas.width = displaySize * dpr;
        this.canvas.height = displaySize * dpr;
        this.canvas.style.width = `${displaySize}px`;
        this.canvas.style.height = `${displaySize}px`;

        if (this.ctx.setTransform) {
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        } else {
            try { this.ctx.resetTransform(); } catch (e) { }
            this.ctx.scale(dpr, dpr);
        }

        this.cellSize = displaySize / this.gridSize;
        this.draw();
    }

    initCarousel() {
        this.carouselOverlay = document.getElementById('carousel-overlay');
        this.carouselBoards = Array.from(document.querySelectorAll('.carousel-board'));
        this.carouselPrevBtn = document.getElementById('carousel-prev');
        this.carouselNextBtn = document.getElementById('carousel-next');
        this.carouselModes = ['classic', 'speedrun', 'blindfold', 'optimal', 'obstacles', 'words'];

        this.carouselIndex = this.carouselModes.indexOf(this.currentMode);
        if (this.carouselIndex === -1) this.carouselIndex = 0;

        // Inject mini boards and wire rules buttons
        this.carouselBoards.forEach((board, index) => {
            const mode = this.carouselModes[index];
            const slot = board.querySelector('.mini-board-slot');
            if (slot) slot.innerHTML = this.generateMiniBoardHTML(mode);

            const rulesBtn = board.querySelector('.carousel-card-rules-btn');
            if (rulesBtn) {
                rulesBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const savedMode = this.currentMode;
                    this.currentMode = mode;
                    this.updateRulesUI();
                    this.currentMode = savedMode;
                    document.getElementById('rules-modal').classList.add('open');
                });
            }
        });

        this.updateCarouselTransforms();

        this.carouselPrevBtn.onclick = () => this.moveCarousel(-1);
        this.carouselNextBtn.onclick = () => this.moveCarousel(1);

        this.carouselBoards.forEach((board, index) => {
            const btn = board.querySelector('.carousel-choose-btn');
            btn.onclick = (e) => {
                e.stopPropagation();
                if (this.carouselIndex === index) {
                    this.chooseCarouselMode(index);
                } else {
                    this.carouselIndex = index;
                    this.updateCarouselTransforms();
                }
            };
            board.onclick = () => {
                if (this.carouselIndex !== index) {
                    this.carouselIndex = index;
                    this.updateCarouselTransforms();
                }
            };
        });

        // Dismiss overlay by clicking the dark backdrop (only after first Play!)
        this.carouselOverlay.addEventListener('click', (e) => {
            if (e.target === this.carouselOverlay && this.carouselCanDismiss) {
                this.dismissCarousel();
            }
        });

        window.addEventListener('keydown', (e) => {
            if (this.carouselOverlay && !this.carouselOverlay.classList.contains('hidden')) {
                if (e.key === 'ArrowLeft') this.moveCarousel(-1);
                if (e.key === 'ArrowRight') this.moveCarousel(1);
                if (e.key === 'Enter') this.chooseCarouselMode(this.carouselIndex);
                if (e.key === 'Escape' && this.carouselCanDismiss) {
                    this.dismissCarousel();
                }
            }
        });
    }

    openCarousel() {
        this.carouselIndex = this.carouselModes.indexOf(this.currentMode);
        if (this.carouselIndex === -1) this.carouselIndex = 0;

        this.carouselBoards.forEach(board => {
            board.classList.remove('zoom-in');
            board.style.opacity = '';
            board.style.pointerEvents = 'auto';
        });
        this.carouselOverlay.classList.remove('hiding', 'hidden');
        this.updateCarouselTransforms();
    }

    dismissCarousel() {
        this.carouselOverlay.classList.add('hidden');
    }

    generateMiniBoardHTML(mode) {
        const S = 5;
        const cfgs = {
            classic: { nodes: [
                {r:0,c:0,cl:'#ef4444'},{r:4,c:4,cl:'#ef4444'},
                {r:0,c:4,cl:'#2563eb'},{r:4,c:0,cl:'#2563eb'},
                {r:2,c:1,cl:'#059669'},{r:2,c:3,cl:'#059669'},
            ]},
            speedrun: { nodes: [
                {r:0,c:0,cl:'#d97706'},{r:3,c:4,cl:'#d97706'},
                {r:0,c:3,cl:'#0891b2'},{r:4,c:1,cl:'#0891b2'},
                {r:1,c:4,cl:'#db2777'},{r:4,c:4,cl:'#db2777'},
            ]},
            blindfold: { fog: true, nodes: [
                {r:0,c:2,cl:'#6d28d9'},{r:4,c:2,cl:'#6d28d9'},
                {r:1,c:0,cl:'#ef4444'},{r:3,c:4,cl:'#ef4444'},
                {r:0,c:4,cl:'#059669'},{r:4,c:0,cl:'#059669'},
            ]},
            optimal: { nodes: [
                {r:0,c:0,cl:'#ef4444'},{r:4,c:4,cl:'#ef4444'},
                {r:0,c:4,cl:'#2563eb'},{r:4,c:0,cl:'#2563eb'},
            ]},
            words: { nodes: [
                {r:1,c:0,cl:'#6d28d9'},{r:3,c:4,cl:'#6d28d9'},
            ], letters: [
                [0,0,'W'],[0,1,'O'],[0,2,'R'],[0,3,'D'],[0,4,'S'],
                [1,1,'I'],[1,2,'N'],[1,3,'K'],[1,4,'S'],
                [2,0,'P'],[2,1,'L'],[2,2,'A'],[2,3,'Y'],[2,4,'!'],
                [3,0,'G'],[3,1,'A'],[3,2,'M'],[3,3,'E'],
                [4,0,'T'],[4,1,'I'],[4,2,'M'],[4,3,'E'],[4,4,'S'],
            ]},
        };
        const cfg = cfgs[mode] || cfgs.classic;
        const nodeMap = new Map(cfg.nodes.map(n => [`${n.r},${n.c}`, n.cl]));
        const letterMap = cfg.letters
            ? new Map(cfg.letters.map(([r, c, l]) => [`${r},${c}`, l]))
            : new Map();
        const fogCls = cfg.fog ? ' mini-board-blindfold' : '';
        let html = `<div class="mini-board mini-board-${mode}${fogCls}">`;
        for (let r = 0; r < S; r++) {
            for (let c = 0; c < S; c++) {
                const key = `${r},${c}`;
                if (nodeMap.has(key)) {
                    html += `<div class="mb-cell"><div class="mb-node" style="background:${nodeMap.get(key)}"></div></div>`;
                } else if (letterMap.has(key)) {
                    html += `<div class="mb-cell mb-letter">${letterMap.get(key)}</div>`;
                } else {
                    html += `<div class="mb-cell"></div>`;
                }
            }
        }
        html += '</div>';
        return html;
    }

    moveCarousel(dir) {
        this.carouselIndex += dir;
        if (this.carouselIndex < 0) this.carouselIndex = this.carouselBoards.length - 1;
        if (this.carouselIndex >= this.carouselBoards.length) this.carouselIndex = 0;
        this.updateCarouselTransforms();
    }

    updateCarouselTransforms() {
        this.carouselBoards.forEach((board, index) => {
            let diff = index - this.carouselIndex;
            
            // Handle wrap-around for smooth 3D effect
            if (diff > this.carouselBoards.length / 2) diff -= this.carouselBoards.length;
            if (diff < -this.carouselBoards.length / 2) diff += this.carouselBoards.length;

            board.classList.remove('center');

            if (diff === 0) {
                board.style.transform = `translateX(0) translateZ(0) rotateY(0)`;
                board.style.opacity = 1;
                board.style.zIndex = 10;
                board.classList.add('center');
            } else {
                const sign = Math.sign(diff);
                const absDiff = Math.abs(diff);
                
                // Adjust translation and rotation based on distance
                const tx = sign * (160 + absDiff * 60);
                const tz = -absDiff * 150;
                const ry = -sign * 25;
                
                board.style.transform = `translateX(${tx}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${1 - absDiff * 0.1})`;
                board.style.opacity = 1 - absDiff * 0.3;
                board.style.zIndex = 10 - absDiff;
            }
        });
    }

    chooseCarouselMode(index) {
        const board = this.carouselBoards[index];
        this.carouselCanDismiss = true;
        this.carouselOverlay.classList.add('hiding');
        board.classList.add('zoom-in');
        board.style.pointerEvents = 'none';

        setTimeout(() => {
            this.carouselOverlay.classList.remove('hiding');
            this.carouselOverlay.classList.add('hidden');
            this.setGameMode(this.carouselModes[index]);
        }, 600);
    }

    setGameMode(mode, isInitialLoad = false) {
        if (this.currentMode === mode) return;
        if (this.currentMode === 'obstacles') this.stopObstacleGlow();
        this.currentMode = mode;

        const targetIndex = mode === 'words' ? this.maxUnlockedWordIndex
                          : mode === 'obstacles' ? this.maxUnlockedObstacleIndex
                          : this.maxUnlockedIndex;
        this.loadLevel(targetIndex);

        this.updateRulesUI();

        let displayMode = mode === 'classic' ? 'Number Link' :
            mode === 'optimal' ? 'Optimal Path' :
                mode === 'words' ? 'Connecting Letters' :
                    mode === 'obstacles' ? 'Obstacles' :
                        mode.charAt(0).toUpperCase() + mode.slice(1);

        const mainTitle = document.getElementById('main-game-title');
        if (mainTitle) {
            mainTitle.innerText = displayMode;
        }

        // FIX: Don't show toast or force a save if the game is just booting up
        if (!isInitialLoad) {
            if (mode === 'obstacles') {
                this.showToast('Obstacles — navigate with ↑↓←→ or WASD', 4000);
            } else {
                this.showToast(`Switched to ${displayMode} Mode`, 2000);
            }
            this.saveProgress();
        }

        if (['blindfold', 'optimal', 'words', 'obstacles'].includes(mode)) {
            const rulesKey = `hasSeenRules_${mode}`;
            if (!localStorage.getItem(rulesKey)) {
                localStorage.setItem(rulesKey, 'true');

                if (!isInitialLoad) {
                    setTimeout(() => {
                        const rulesModal = document.getElementById('rules-modal');
                        if (rulesModal) rulesModal.classList.add('open');
                    }, 400);
                }
            }
        }
    }

    enforceSavedMode() {
        const targetMode = this.currentMode || 'classic';
        this.currentMode = null;
        this.setGameMode(targetMode, true);
        if (this.carouselOverlay && !this.carouselOverlay.classList.contains('hidden')) {
            this.carouselIndex = this.carouselModes.indexOf(targetMode);
            if (this.carouselIndex === -1) this.carouselIndex = 0;
            this.updateCarouselTransforms();
        }
    }

    startSpeedrun() {
        if (this.isSpeedrunActive) return;
        this.isSpeedrunActive = true;
        this.speedrunStartTime = Date.now() - this.speedrunCurrentTime;
        this.updateUI();

        const tick = () => {
            if (!this.isSpeedrunActive) return;
            this.speedrunCurrentTime = Date.now() - this.speedrunStartTime;
            document.getElementById('hints-display').innerText = this.formatTime(this.speedrunCurrentTime);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    stopSpeedrun() {
        this.isSpeedrunActive = false;
        this.updateUI();
    }

    resetSpeedrun() {
        this.stopSpeedrun();
        this.speedrunCurrentTime = 0;
        if (this.currentMode === 'speedrun') {
            document.getElementById('hints-display').innerText = this.formatTime(0);
        }
    }

    bindInputs() {
        this.canvas.addEventListener('mousedown', (e) => this.handleStart(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMove(e));
        window.addEventListener('mouseup', () => this.handleEnd());
        this.canvas.addEventListener('touchstart', (e) => this.handleStart(e, true), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleMove(e, true), { passive: false });
        window.addEventListener('touchend', () => this.handleEnd());
        document.getElementById('btn-show-answer').onclick = () => this.showAnswer();
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    getPos(e, isTouch) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = isTouch ? e.touches[0].clientX : e.clientX;
        const clientY = isTouch ? e.touches[0].clientY : e.clientY;
        return {
            c: Math.floor((clientX - rect.left) / (rect.width / this.gridSize)),
            r: Math.floor((clientY - rect.top) / (rect.height / this.gridSize))
        };
    }

    getLineAt(r, c) { return this.userLines.find(line => line.points.some(p => p.r === r && p.c === c)); }

    handleStart(e, isTouch) {
        if (this.currentMode === 'obstacles') {
            this.showToast('Obstacles: use ↑↓←→ or WASD — no mouse/touch', 3000);
            return;
        }

        if (this.currentMode === 'speedrun' && !this.isSpeedrunActive) {
            this.startSpeedrun();
        }

        if (this.isWinning) return;

        if (isTouch) e.preventDefault();

        const { r, c } = this.getPos(e, isTouch);
        if (!this.isValidCell(r, c)) return;
        const cell = this.grid[r][c];

        if (cell.val !== null) {
            const cutIndex = this.userLines.findIndex(l => l.startVal === cell.val);
            if (cutIndex !== -1) {
                this.userLines = this.userLines.slice(0, cutIndex);
                this.draw();
            }

            let isValidStart = false;

            if (cell.val === 1 && this.userLines.length === 0) {
                isValidStart = true;
            } else if (this.userLines.length > 0) {
                const lastLine = this.userLines[this.userLines.length - 1];
                const lastPt = lastLine.points[lastLine.points.length - 1];
                if (lastPt.r === r && lastPt.c === c) {
                    isValidStart = true;
                }
            }

            if (isValidStart) {
                this.isDrawing = true;
                this.currentDragLine = { startVal: cell.val, points: [{ r, c }], widthScale: 0.45 };
                this.lastMoveCell = { r, c };
                this.draw();
            }
        }
    }

    handleEnd() {
        this.isDrawing = false;
        this.currentDragLine = null;
        this.lastMoveCell = null;
        this.draw();
    }

    handleMove(e, isTouch) {
        if (this.currentMode === 'obstacles') return;
        if (!this.isDrawing || !this.currentDragLine || this.isWinning) return;
        if (isTouch) e.preventDefault();
        const { r, c } = this.getPos(e, isTouch);
        if (!this.isValidCell(r, c)) return;

        // Prevent re-processing the same cell (avoids TP oscillation during drag)
        if (this.lastMoveCell && this.lastMoveCell.r === r && this.lastMoveCell.c === c) return;
        this.lastMoveCell = { r, c };

        const dl = this.currentDragLine;
        if (dl.tpJustOccurred) {
            const pts = dl.points;
            const last = pts[pts.length - 1];
            const secondLast = pts.length >= 2 ? pts[pts.length - 2] : null;
            if (secondLast && r === secondLast.r && c === secondLast.c) {
                // Cursor moved back to entry TP cell — allow backtrack through TP
                dl.tpJustOccurred = false;
            } else if (Math.abs(r - last.r) + Math.abs(c - last.c) === 1) {
                // Cursor adjacent to exit TP — clear flag and continue drawing
                dl.tpJustOccurred = false;
            } else {
                return; // Cursor still far from exit TP — hold
            }
        }

        this.attemptMove(r, c);
    }

    hasObstacleWall(r1, c1, r2, c2) {
        if (this.currentMode !== 'obstacles' || !this.obstacleWalls.length) return false;
        const dr = r2 - r1, dc = c2 - c1;
        return this.obstacleWalls.some(w => {
            if (dr === 0 && dc === 1)  return w.r === r1 && w.c === c1 && w.side === 'right';
            if (dr === 0 && dc === -1) return w.r === r1 && w.c === c2 && w.side === 'right';
            if (dr === 1 && dc === 0)  return w.r === r1 && w.c === c1 && w.side === 'bottom';
            if (dr === -1 && dc === 0) return w.r === r2 && w.c === c2 && w.side === 'bottom';
            return false;
        });
    }

    getObstacleTP(r, c) {
        if (this.currentMode !== 'obstacles') return null;
        return this.obstacleTeleporters.find(t => t.r === r && t.c === c) || null;
    }

    isValidTPEntry(fromR, fromC, toR, toC, dir) {
        const dr = toR - fromR, dc = toC - fromC;
        if (dir === 'right') return dr === 0 && dc === 1;
        if (dir === 'left')  return dr === 0 && dc === -1;
        if (dir === 'down')  return dr === 1 && dc === 0;
        if (dir === 'up')    return dr === -1 && dc === 0;
        return false;
    }

    attemptMove(r, c) {
        const pts = this.currentDragLine.points;
        const last = pts[pts.length - 1];

        if (r === last.r && c === last.c) return;

        // Backtrack: moving to second-to-last point
        if (pts.length > 1) {
            const prev = pts[pts.length - 2];
            if (prev.r === r && prev.c === c) {
                pts.pop();
                // If the new tail is a TP entry, also pop the exit (they come in pairs)
                if (pts.length >= 1 && pts[pts.length - 1].isTPEntry) pts.pop();
                this.draw();
                return;
            }
        }

        if (Math.abs(r - last.r) + Math.abs(c - last.c) !== 1) return;

        // Wall check
        if (this.hasObstacleWall(last.r, last.c, r, c)) return;

        // Teleporter check
        const tp = this.getObstacleTP(r, c);
        if (tp) {
            const partner = this.obstacleTeleporters.find(t => t.pair === tp.pair && !(t.r === r && t.c === c));
            if (!partner) return;
            if (this.isCellOccupied(r, c) || this.isCellOccupied(partner.r, partner.c)) return;
            pts.push({ r, c, isTPEntry: true });
            pts.push({ r: partner.r, c: partner.c });
            this.currentDragLine.tpJustOccurred = true;
            this.triggerTileAnimation(r, c);
            this.triggerTileAnimation(partner.r, partner.c);
            this.flashTPRipple(r, c, partner.r, partner.c);
            this.draw();
            return;
        }

        if (this.isCellOccupied(r, c)) {
            const target = this.grid[r][c];

            if (this.userLines.length > 0) {
                const lastLine = this.userLines[this.userLines.length - 1];
                if (lastLine.points.length > 1) {
                    const prevPt = lastLine.points[lastLine.points.length - 2];
                    if (prevPt.r === r && prevPt.c === c) {
                        this.userLines.pop();
                        this.currentDragLine = lastLine;
                        this.currentDragLine.widthScale = 0.45;
                        this.currentDragLine.points.pop();
                        this.draw();
                        return;
                    }
                }
            }

            if (target.type === 'fixed') {
                if (target.val === this.currentDragLine.startVal) {
                    this.currentDragLine.points = [{ r, c }];
                    this.draw();
                    return;
                }

                const lastLine = this.userLines[this.userLines.length - 1];
                if (lastLine && target.val === lastLine.startVal) {
                    this.userLines.pop();
                    this.currentDragLine = { startVal: target.val, points: [{ r, c }], widthScale: 0.45 };
                    this.draw();
                    return;
                }

                const isUsed = this.userLines.some(l => l.startVal === target.val) || (target.val === 1);

                if (!isUsed) {
                    pts.push({ r, c });
                    this.userLines.push(this.currentDragLine);

                    this.triggerTileAnimation(r, c);

                    if (this.userLines.length < this.maxNumber - 1) {
                        this.currentDragLine = { startVal: target.val, points: [{ r, c }], widthScale: 0.45 };
                    } else {
                        this.isDrawing = false;
                        this.currentDragLine = null;
                    }
                    this.checkWin();
                    this.draw();
                    return;
                }
                return;
            }

            const lineAtTarget = this.getLineAt(r, c);
            if (lineAtTarget) {
                return;
            }

            return;
        }

        pts.push({ r, c }); this.draw();
    }

    handleKeyDown(e) {
        if (!this.isGameSectionVisible) return;
        if (this.isWinning) return;

        const carouselOpen = this.carouselOverlay && !this.carouselOverlay.classList.contains('hidden');
        const modalOpen = document.querySelector('.modal-overlay.open') !== null;
        const typingInInput = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');

        if (!carouselOpen && !modalOpen && !typingInInput) {
            if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.undo();
                return;
            }
            if (e.key === 'Escape') {
                if (this.isDrawing && this.currentDragLine) {
                    e.preventDefault();
                    this.isDrawing = false;
                    this.currentDragLine = null;
                    this.draw();
                }
                return;
            }
            if (e.key === 'h' || e.key === 'H') {
                e.preventDefault();
                this.useHint();
                return;
            }
            if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                this.resetLevel();
                return;
            }
        }

        let dr = 0, dc = 0;
        if (e.key === 'ArrowUp') dr = -1;
        else if (e.key === 'ArrowDown') dr = 1;
        else if (e.key === 'ArrowLeft') dc = -1;
        else if (e.key === 'ArrowRight') dc = 1;
        else if (!carouselOpen && !modalOpen && !typingInInput) {
            if (e.key === 'w' || e.key === 'W') dr = -1;
            else if (e.key === 's' || e.key === 'S') dr = 1;
            else if (e.key === 'a' || e.key === 'A') dc = -1;
            else if (e.key === 'd' || e.key === 'D') dc = 1;
            else return;
        } else return;

        e.preventDefault();

        if (this.currentMode === 'speedrun' && !this.isSpeedrunActive) {
            this.startSpeedrun();
        }

        if (!this.isDrawing || !this.currentDragLine) {
            let startNode = null;
            let startVal = null;

            if (this.userLines.length > 0) {
                const lastLine = this.userLines[this.userLines.length - 1];
                const lastPt = lastLine.points[lastLine.points.length - 1];
                const cell = this.grid[lastPt.r][lastPt.c];
                if (cell.val !== null) {
                    startNode = lastPt;
                    startVal = cell.val;
                }
            } else {
                for (let r = 0; r < this.gridSize; r++) {
                    for (let c = 0; c < this.gridSize; c++) {
                        if (this.grid[r][c].val === 1) {
                            startNode = { r, c };
                            startVal = 1;
                            break;
                        }
                    }
                    if (startNode) break;
                }
            }

            if (startNode) {
                this.isDrawing = true;
                this.currentDragLine = {
                    startVal: startVal,
                    points: [{ r: startNode.r, c: startNode.c }],
                    widthScale: 0.45
                };
                this.draw();
            } else {
                return;
            }
        }

        const pts = this.currentDragLine.points;
        const head = pts[pts.length - 1];
        const r = head.r + dr;
        const c = head.c + dc;

        if (!this.isValidCell(r, c)) return;

        this.attemptMove(r, c);
    }

    isCellOccupied(r, c) {
        if (this.grid[r][c].type === 'fixed') return true;

        for (let line of this.userLines) { for (let p of line.points) { if (p.r === r && p.c === c) return true; } }

        if (this.currentDragLine) {
            for (let i = 0; i < this.currentDragLine.points.length - 1; i++) {
                const p = this.currentDragLine.points[i];

                if (p.r === r && p.c === c) return true;
            }
        }

        return false;
    }

    isValidCell(r, c) { return r >= 0 && r < this.gridSize && c >= 0 && c < this.gridSize; }

    undo() {
        if (this.isWinning) return;
        if (this.isDrawing && this.currentDragLine) {
            this.isDrawing = false;
            this.currentDragLine = null;
            this.draw();
        } else if (this.userLines.length > 0) {
            this.userLines.pop();
            this.draw();
        }
    }

    resetLevel() {
        if (!this.isWinning) {
            this.userLines = [];
            this.currentDragLine = null;
            if (this.currentMode === 'speedrun') {
                this.resetSpeedrun();
            }
            this.draw();
            this.showToast("Level reset", 1500);
        }
    }

    showAnswer() {
        if (this.currentMode === 'words') {
            if (this.currentWordLevelIndex >= this.maxUnlockedWordIndex && !this.isDevMode) return;

            const level = this.wordLevels[this.currentWordLevelIndex];
            const sidebar = document.getElementById('word-def-sidebar');
            const content = document.getElementById('word-def-content');

            const word = level.validWords[0];
            const def = level.wordDefinitions ? level.wordDefinitions[word] : "Definition not found.";

            content.innerHTML = `<strong style="color: var(--accent); font-size: 1.2rem; text-transform: uppercase;">${word}</strong><br><br>${def.toLowerCase()}`;
            sidebar.classList.add('open');
            return;
        }

        if (this.currentLevelIndex >= this.maxUnlockedIndex && !this.isDevMode) return;

        this.userLines = [];
        this.currentDragLine = null;
        this.isDrawing = false;
        this.isWinning = false;

        for (let val = 1; val < this.maxNumber; val++) {
            const startIdx = this.numberIndices[val];
            const endIdx = this.numberIndices[val + 1];

            if (startIdx !== undefined && endIdx !== undefined) {
                const points = this.solutionPath.slice(startIdx, endIdx + 1);

                this.userLines.push({
                    startVal: val,
                    points: points,
                    widthScale: 0.5
                });
            }
        }

        this.draw();
    }

    checkWin() {
        if (this.currentMode === 'words') {
            if (!this.currentDragLine && this.userLines.length === 1) {
                const line = this.userLines[0];
                const lastPt = line.points[line.points.length - 1];
                const endCell = this.grid[lastPt.r][lastPt.c];

                if (endCell.val === 2) {
                    const level = this.wordLevels[this.currentWordLevelIndex];

                    let finalWord = "";
                    for (let pt of line.points) {
                        finalWord += this.grid[pt.r][pt.c].letter;
                    }

                    this.currentWordString = finalWord;
                    const hintsDisplay = document.getElementById('hints-display');
                    if (hintsDisplay) hintsDisplay.innerText = finalWord;

                    if (level.validWords.includes(finalWord)) {
                        this.triggerWinSequence();
                    } else {
                        if (hintsDisplay) {
                            hintsDisplay.style.color = "#ef4444";
                            setTimeout(() => hintsDisplay.style.color = "", 1000);
                        }
                        this.userLines = [];
                        this.draw();
                    }
                }
            }
            return;
        }

        const set = new Set();
        this.grid.forEach((row, r) => row.forEach((cell, c) => { if (cell.type === 'fixed') set.add(`${r},${c}`); }));
        this.userLines.forEach(line => { line.points.forEach(p => set.add(`${p.r},${p.c}`)); });

        const isGridFull = (set.size === this.gridSize * this.gridSize);
        if (this.currentMode !== 'optimal' && !isGridFull) return;

        for (let i = 1; i < this.maxNumber; i++) {
            const line = this.userLines.find(l => l.startVal === i);

            if (!line) return;

            const lastPt = line.points[line.points.length - 1];
            const endCell = this.grid[lastPt.r][lastPt.c];

            if (endCell.val !== i + 1) return;
        }

        this.triggerWinSequence();
    }

    useHint() {
        if ((this.hints <= 0 && !this.isDevMode) || this.isWinning) {
            if (!this.isWinning) this.showToast("No hints remaining! Come back tomorrow.", 3000);
            return;
        }

        if (!this.isDevMode) {
            this.hints--;
            this.saveProgress();
        }

        if (this.currentMode === 'words') {
            this.showWordsHint();
            return;
        }

        if (this.currentMode === 'optimal') {
            this.showOptimalHint();
            return;
        }

        if (this.currentMode === 'obstacles') {
            this.showObstaclesHint();
            return;
        }

        let currentMax = 1;
        while (currentMax < this.maxNumber) {
            const hasNext = this.userLines.find(l => l.startVal === currentMax);
            if (hasNext) { currentMax++; } else { break; }
        }

        const targetNumber = Math.min(currentMax + 4, this.maxNumber);
        const startIndex = this.numberIndices[currentMax];
        const endIndex = this.numberIndices[targetNumber];

        if (startIndex === undefined || endIndex === undefined) return;

        const hintPoints = this.solutionPath.slice(startIndex, endIndex + 1);
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = this.isDarkMode ? "#FFFF00" : "#FFD700";
        ctx.lineWidth = this.cellSize * 0.4;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath();
        const cx = c => c * this.cellSize + this.cellSize / 2;
        const cy = r => r * this.cellSize + this.cellSize / 2;
        ctx.moveTo(cx(hintPoints[0].c), cy(hintPoints[0].r));

        for (let i = 1; i < hintPoints.length; i++) { ctx.lineTo(cx(hintPoints[i].c), cy(hintPoints[i].r)); }

        ctx.stroke(); ctx.restore();
        setTimeout(() => this.draw(), 2000);
    }

    showOptimalHint() {
        let currentMax = 1;
        while (currentMax < this.maxNumber) {
            if (this.userLines.find(l => l.startVal === currentMax)) currentMax++;
            else break;
        }
        if (currentMax >= this.maxNumber) return;

        let startR, startC, endR, endC;
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const cell = this.grid[r][c];
                if (cell.type === 'fixed') {
                    if (cell.val === currentMax)     { startR = r; startC = c; }
                    if (cell.val === currentMax + 1) { endR = r;   endC = c;   }
                }
            }
        }
        if (startR === undefined || endR === undefined) return;

        const path = this.findShortestPath(startR, startC, endR, endC);
        if (!path) return;

        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = this.isDarkMode ? "#FFFF00" : "#FFD700";
        ctx.lineWidth = this.cellSize * 0.4;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath();
        const cx = c => c * this.cellSize + this.cellSize / 2;
        const cy = r => r * this.cellSize + this.cellSize / 2;
        ctx.moveTo(cx(path[0].c), cy(path[0].r));
        for (let i = 1; i < path.length; i++) ctx.lineTo(cx(path[i].c), cy(path[i].r));
        ctx.stroke();
        ctx.restore();
        setTimeout(() => this.draw(), 2000);
    }

    showObstaclesHint() {
        const sol = this.solutionPath;
        if (!sol || sol.length < 2) return;

        // In Obstacles, the active path lives in currentDragLine, not userLines
        let headR, headC;
        if (this.currentDragLine && this.currentDragLine.points.length > 0) {
            const pts = this.currentDragLine.points;
            headR = pts[pts.length - 1].r;
            headC = pts[pts.length - 1].c;
        } else if (this.userLines.length > 0) {
            const last = this.userLines[this.userLines.length - 1];
            const pts = last.points;
            headR = pts[pts.length - 1].r;
            headC = pts[pts.length - 1].c;
        } else {
            headR = sol[0].r;
            headC = sol[0].c;
        }

        let startIdx = sol.findIndex(p => p.r === headR && p.c === headC);
        if (startIdx === -1) startIdx = 0;

        // Collect up to 6 steps forward; stop before any TP jump
        const hintPts = [sol[startIdx]];
        for (let i = startIdx + 1; i < sol.length && hintPts.length <= 6; i++) {
            const prev = sol[i - 1], curr = sol[i];
            if (Math.abs(prev.r - curr.r) + Math.abs(prev.c - curr.c) > 1) break;
            hintPts.push(curr);
        }
        if (hintPts.length < 2) return;

        // Store as state so the glow loop's draw() calls keep rendering it
        this.obstacleHintPts = hintPts;
        this.draw();
        if (this.obstacleHintTimeout) clearTimeout(this.obstacleHintTimeout);
        this.obstacleHintTimeout = setTimeout(() => {
            this.obstacleHintPts = null;
            this.draw();
        }, 2000);
    }

    findShortestPath(startR, startC, endR, endC) {
        const queue = [[startR, startC, [{ r: startR, c: startC }]]];
        const visited = new Set([`${startR},${startC}`]);
        while (queue.length) {
            const [r, c, path] = queue.shift();
            if (r === endR && c === endC) return path;
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nr = r + dr, nc = c + dc;
                const key = `${nr},${nc}`;
                if (nr >= 0 && nr < this.gridSize && nc >= 0 && nc < this.gridSize && !visited.has(key)) {
                    visited.add(key);
                    queue.push([nr, nc, [...path, { r: nr, c: nc }]]);
                }
            }
        }
        return null;
    }

    findWordSolutionPath(word) {
        const start = this.numberIndices[1];
        const end = this.numberIndices[2];
        if (!start || !end) return null;
        if (this.grid[start.r][start.c].letter !== word[0]) return null;
        if (this.grid[end.r][end.c].letter !== word[word.length - 1]) return null;

        const visited = new Set([`${start.r},${start.c}`]);
        const path = [{ r: start.r, c: start.c }];

        const dfs = (r, c, idx) => {
            if (idx === word.length - 1) return r === end.r && c === end.c;
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nr = r + dr, nc = c + dc;
                const key = `${nr},${nc}`;
                if (nr >= 0 && nr < this.gridSize && nc >= 0 && nc < this.gridSize
                    && !visited.has(key) && this.grid[nr][nc].letter === word[idx + 1]) {
                    visited.add(key);
                    path.push({ r: nr, c: nc });
                    if (dfs(nr, nc, idx + 1)) return true;
                    path.pop();
                    visited.delete(key);
                }
            }
            return false;
        };

        return dfs(start.r, start.c, 0) ? [...path] : null;
    }

    showWordsHint() {
        const level = this.wordLevels[this.currentWordLevelIndex];
        if (!level) return;

        const currentPoints = this.userLines.length > 0
            ? this.userLines[0].points
            : (this.currentDragLine ? this.currentDragLine.points : []);

        let solutionPath = null;
        let hintStartIdx = 0;

        if (currentPoints.length > 0) {
            const partialWord = currentPoints.map(p => this.grid[p.r][p.c].letter).join('');
            for (const word of level.validWords) {
                if (word.startsWith(partialWord)) {
                    const candidate = this.findWordSolutionPath(word);
                    if (candidate) {
                        let matches = currentPoints.every((pt, i) =>
                            candidate[i] && candidate[i].r === pt.r && candidate[i].c === pt.c
                        );
                        if (matches) {
                            solutionPath = candidate;
                            hintStartIdx = currentPoints.length - 1;
                            break;
                        }
                    }
                }
            }
        }

        if (!solutionPath) {
            for (const word of level.validWords) {
                solutionPath = this.findWordSolutionPath(word);
                if (solutionPath) break;
            }
            hintStartIdx = 0;
        }

        if (!solutionPath) return;

        const hintEndIdx = Math.min(hintStartIdx + 4, solutionPath.length - 1);
        const hintPoints = solutionPath.slice(hintStartIdx, hintEndIdx + 1);

        const ctx = this.ctx;
        const cs = this.cellSize;
        const cx = c => c * cs + cs / 2;
        const cy = r => r * cs + cs / 2;

        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = this.isDarkMode ? "#FFFF00" : "#FFD700";
        ctx.lineWidth = cs * 0.4;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(cx(hintPoints[0].c), cy(hintPoints[0].r));
        for (let i = 1; i < hintPoints.length; i++) ctx.lineTo(cx(hintPoints[i].c), cy(hintPoints[i].r));
        ctx.stroke();
        ctx.restore();
        setTimeout(() => this.draw(), 2000);
    }

    // Obstacles helpers

    startObstacleGlow() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (this.obstacleGlowRAF) cancelAnimationFrame(this.obstacleGlowRAF);
        const tick = () => {
            this.obstacleTPGlowPhase = (Date.now() % 2000) / 2000; // 0-1 cycle
            if (this.currentMode === 'obstacles' && !this.isWinning) {
                this.draw();
                this.obstacleGlowRAF = requestAnimationFrame(tick);
            }
        };
        this.obstacleGlowRAF = requestAnimationFrame(tick);
    }

    stopObstacleGlow() {
        if (this.obstacleGlowRAF) {
            cancelAnimationFrame(this.obstacleGlowRAF);
            this.obstacleGlowRAF = null;
        }
    }

    flashTPRipple(r1, c1, r2, c2) {
        const ctx = this.ctx;
        const cs = this.cellSize;
        const cx = c => c * cs + cs / 2;
        const cy = r => r * cs + cs / 2;
        const accentColor = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#6d28d9';
        let frame = 0;
        const animate = () => {
            if (frame > 20) { this.draw(); return; }
            frame++;
            const t = frame / 20;
            const radius = cs * 0.5 * t;
            ctx.save();
            ctx.globalAlpha = (1 - t) * 0.7;
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = 3;
            for (const [r, c] of [[r1, c1], [r2, c2]]) {
                ctx.beginPath();
                ctx.arc(cx(c), cy(r), radius, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    checkDailyHint() {
        const today = new Date().toDateString();
        if (this.lastHintDate === null) {
            this.lastHintDate = today;
            this.saveProgress();
            return;
        }
        if (this.lastHintDate !== today) {
            this.hints = 2;
            this.lastHintDate = today;
            this.showToast("New Day! Hints reset to 2. 💡");
            this.saveProgress();
        }
    }

    checkDailyStreak() {
        if (!this.currentUser) return;

        const today = new Date();
        const todayString = today.toDateString();

        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const yesterdayString = yesterday.toDateString();

        if (!this.lastLoginDate) {
            this.streak = 1;
            this.lastLoginDate = todayString;
            this.saveProgress();
        } else if (this.lastLoginDate !== todayString) {
            if (this.lastLoginDate === yesterdayString) {
                this.streak++;
                setTimeout(() => {
                    this.showToast(`🔥 Streak increased! ${this.streak} Days! 🔥`, 4000);
                    this.startCelebration();

                    setTimeout(() => this.stopCelebration(), 3000);
                }, 1000);
            } else {
                this.streak = 1;
            }
            this.lastLoginDate = todayString;
            this.saveProgress();
        }
    }

    calculateTilesUsed() {
        const usedSet = new Set();
        this.userLines.forEach(line => line.points.forEach(p => usedSet.add(`${p.r},${p.c}`)));
        if (this.currentDragLine) {
            this.currentDragLine.points.forEach(p => usedSet.add(`${p.r},${p.c}`));
        }
        return usedSet.size;
    }

    // Animation Methods
    handleLevelComplete() {
        if (this.currentMode === 'words') {
            if (this.currentWordLevelIndex === this.maxUnlockedWordIndex) this.maxUnlockedWordIndex++;
        } else if (this.currentMode === 'obstacles') {
            if (this.currentObstacleLevelIndex === this.maxUnlockedObstacleIndex) this.maxUnlockedObstacleIndex++;
        } else {
            if (this.currentLevelIndex === this.maxUnlockedIndex) this.maxUnlockedIndex++;
        }

        this.showToast('Level Complete! 🎉', 2000);
        this.startCelebration();

        if (typeof gtag === 'function') {
            const activeLevels = this.currentMode === 'words' ? this.wordLevels
                               : this.currentMode === 'obstacles' ? this.obstacleLevels
                               : this.allLevels;
            const activeIndex = this.currentMode === 'words' ? this.currentWordLevelIndex
                              : this.currentMode === 'obstacles' ? this.currentObstacleLevelIndex
                              : this.currentLevelIndex;
            gtag('event', 'level_complete', {
                'level_index': activeIndex,
                'level_id': activeLevels[activeIndex] ? activeLevels[activeIndex].id : (activeIndex + 1)
            });
        }

        setTimeout(() => {
            this.stopCelebration();

            if (this.currentMode === 'words') {
                if (this.currentWordLevelIndex + 1 < this.wordLevels.length) {
                    this.currentWordLevelIndex++;
                    this.saveProgress();
                    this.loadLevel(this.currentWordLevelIndex);
                } else {
                    this.showToast("You've beaten all Connecting Letters levels! 🎉", 4000);
                }
                return;
            }

            if (this.currentMode === 'obstacles') {
                if (this.currentObstacleLevelIndex + 1 < this.obstacleLevels.length) {
                    this.currentObstacleLevelIndex++;
                    this.saveProgress();
                    this.loadLevel(this.currentObstacleLevelIndex);
                } else {
                    this.showToast("You've beaten all Obstacles levels! 🎉", 4000);
                }
                return;
            }

            if (this.currentMode === 'speedrun') {
                const bestTime = this.speedrunBestTimes[this.currentLevelIndex] || Infinity;
                if (this.speedrunCurrentTime < bestTime) {
                    this.speedrunBestTimes[this.currentLevelIndex] = this.speedrunCurrentTime;
                    this.showToast(`New Best Time: ${this.formatTime(this.speedrunCurrentTime)}! 🏆`, 4000);
                    this.saveProgress();
                } else {
                    this.showToast(`Time: ${this.formatTime(this.speedrunCurrentTime)}. Best: ${this.formatTime(bestTime)}`, 4000);
                }
            } else if (this.currentMode === 'optimal') {
                const tilesUsed = this.calculateTilesUsed();
                const bestScore = this.optimalBestScores[this.currentLevelIndex] || Infinity;
                if (tilesUsed < bestScore) {
                    this.optimalBestScores[this.currentLevelIndex] = tilesUsed;
                    this.showToast(`New Optimal Path: ${tilesUsed} tiles! 🏆`, 4000);
                    this.saveProgress();
                } else {
                    this.showToast(`Tiles Used: ${tilesUsed}. Best: ${bestScore}`, 4000);
                }
            }

            if (this.currentLevelIndex + 1 < this.allLevels.length) {
                this.currentLevelIndex++;
                this.saveProgress();
                this.loadLevel(this.currentLevelIndex);
            } else {
                this.showToast("You've beaten all levels! 🎉", 4000);
            }
        }, 2000);
    }

    updateUI() {
        if (this.allLevels && this.allLevels[this.currentLevelIndex]) {
            // level-select-btn removed; level shown in panel
        }

        const streakDisplay = document.getElementById('streak-display');
        if (streakDisplay) {
            if (this.currentUser) {
                streakDisplay.style.display = 'inline';
                streakDisplay.innerText = `🔥 ${this.streak}`;
            } else {
                streakDisplay.style.display = 'none';
            }
        }

        const answerBtn = document.getElementById('btn-show-answer');
        const hintBtn = document.getElementById('btn-hint');
        const hintsDisplay = document.getElementById('hints-display');
        const bestTimeDisplay = document.getElementById('best-time-display');

        if (this.currentMode === 'speedrun') {
            hintsDisplay.innerText = this.formatTime(this.speedrunCurrentTime || 0);
            hintBtn.innerText = "Start";
            hintBtn.onclick = () => this.startSpeedrun();
            answerBtn.style.display = 'none';

            if (bestTimeDisplay) {
                bestTimeDisplay.style.display = 'inline';
                const bestTime = this.speedrunBestTimes[this.currentLevelIndex];
                if (bestTime !== undefined && bestTime !== Infinity) {
                    bestTimeDisplay.innerText = `Best: ${this.formatTime(bestTime)}`;
                } else {
                    bestTimeDisplay.innerText = `Best: 00:00.00`;
                }
            }

            if (this.isSpeedrunActive) {
                hintBtn.disabled = true;
                hintBtn.style.opacity = '0.5';
            } else {
                hintBtn.disabled = false;
                hintBtn.style.opacity = '1';
            }
        } else if (this.currentMode === 'optimal') {
            hintsDisplay.innerText = `Tiles: ${this.calculateTilesUsed()}`;
            hintBtn.innerText = "Hint";
            hintBtn.onclick = () => this.useHint();
            hintBtn.disabled = false;
            hintBtn.style.opacity = '1';
            answerBtn.style.display = 'none';

            if (bestTimeDisplay) {
                bestTimeDisplay.style.display = 'inline';
                const bestScore = this.optimalBestScores[this.currentLevelIndex];
                if (bestScore !== undefined && bestScore !== Infinity) {
                    bestTimeDisplay.innerText = `Best: ${bestScore} tiles`;
                } else {
                    bestTimeDisplay.innerText = `Best: --`;
                }
            }
        } else if (this.currentMode === 'obstacles') {
            hintsDisplay.innerText = this.isDevMode ? `Hints: ∞ (Dev)` : `Hints: ${this.hints}`;
            hintBtn.innerText = "Hint";
            hintBtn.onclick = () => this.useHint();
            hintBtn.disabled = false;
            hintBtn.style.opacity = '1';
            answerBtn.style.display = 'none';
            if (bestTimeDisplay) bestTimeDisplay.style.display = 'none';
        } else if (this.currentMode === 'words') {
            // level-select-btn removed
            hintBtn.innerText = "Hint";
            hintBtn.onclick = () => this.useHint();
            hintBtn.disabled = false;
            hintBtn.style.opacity = '1';
            if (bestTimeDisplay) bestTimeDisplay.style.display = 'none';

            if (this.currentWordLevelIndex < this.maxUnlockedWordIndex || this.isDevMode) {
                answerBtn.style.display = this.isMobile ? 'none' : 'inline-block';
            } else {
                answerBtn.style.display = 'none';
            }
        } else {
            hintsDisplay.innerText = this.isDevMode ? `Hints: ∞ (Dev)` : `Hints: ${this.hints}`;
            hintBtn.innerText = "Hint";
            hintBtn.onclick = () => this.useHint();
            hintBtn.disabled = false;
            hintBtn.style.opacity = '1';

            if (bestTimeDisplay) {
                bestTimeDisplay.style.display = 'none';
            }

            if (this.currentLevelIndex < this.maxUnlockedIndex || this.isDevMode) {
                answerBtn.style.display = this.isMobile ? 'none' : 'inline-block';
            } else {
                answerBtn.style.display = 'none';
            }
        }
    }

    draw(isAnimating = false, animationProgress = 1) {
        if (!this.grid || !this.grid[0]) return;
        const cs = this.cellSize;
        const ctx = this.ctx;
        const style = getComputedStyle(document.body);
        const bgColor = style.getPropertyValue('--grid-bg').trim();
        const lineColor = style.getPropertyValue('--line-color').trim();
        const nodeColor = style.getPropertyValue('--node-color').trim();
        const nodeTextColor = this.isDarkMode ? "#000" : "#fff";

        if (this.currentMode === 'words' && !isAnimating) {
            let str = "";
            const points = this.currentDragLine ? this.currentDragLine.points : (this.userLines.length > 0 ? this.userLines[0].points : []);
            for (let pt of points) {
                str += this.grid[pt.r][pt.c].letter;
            }
            this.currentWordString = str;

            const hintsDisplay = document.getElementById('hints-display');
            if (hintsDisplay) hintsDisplay.innerText = str ? str : "Connect to form a word!";
        }

        if (this.currentMode === 'optimal' && !isAnimating) {
            const hintsDisplay = document.getElementById('hints-display');
            if (hintsDisplay) hintsDisplay.innerText = `Tiles: ${this.calculateTilesUsed()}`;
        }

        let keepAnimating = false;
        if (!isAnimating) {
            this.userLines.forEach(l => {
                if (l.widthScale === undefined) l.widthScale = 0.5;

                if (l.widthScale < 0.5) {
                    l.widthScale += 0.05;
                    if (l.widthScale > 0.5) l.widthScale = 0.5;
                    keepAnimating = true;
                }
            });
        }

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, this.gridSize * cs, this.gridSize * cs);

        const cx = c => c * cs + cs / 2;
        const cy = r => r * cs + cs / 2;

        if (!isAnimating) {
            ctx.fillStyle = lineColor;
            ctx.globalAlpha = 0.15;

            const fillCell = (r, c) => {
                ctx.fillRect(c * cs + 1, r * cs + 1, cs - 2, cs - 2);
            };

            this.userLines.forEach(line => {
                line.points.forEach(p => fillCell(p.r, p.c));
            });

            if (this.currentDragLine) {
                this.currentDragLine.points.forEach(p => fillCell(p.r, p.c));
            }

            ctx.globalAlpha = 1.0;
        }

        if (!isAnimating) {
            ctx.strokeStyle = this.isDarkMode ? "#374151" : "#f3f4f6";
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i <= this.gridSize; i++) {
                ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, this.gridSize * cs);
                ctx.moveTo(0, i * cs); ctx.lineTo(this.gridSize * cs, i * cs);
            }
            ctx.stroke();
        }

        // Obstacles: draw walls and teleporters
        if (this.currentMode === 'obstacles' && !isAnimating) {
            this.drawObstacleWalls(ctx, cs);
            this.drawObstacleTeleporters(ctx, cs, cx, cy);
        }

        const drawPoly = (points, wScale = 0.5) => {
            if (points.length < 2) return;
            ctx.beginPath(); ctx.lineCap = "round"; ctx.lineJoin = "round";

            ctx.lineWidth = cs * wScale;
            ctx.strokeStyle = lineColor;
            ctx.moveTo(cx(points[0].c), cy(points[0].r));
            for (let i = 1; i < points.length; i++) {
                if (points[i - 1].isTPEntry) ctx.moveTo(cx(points[i].c), cy(points[i].r));
                else ctx.lineTo(cx(points[i].c), cy(points[i].r));
            }
            ctx.stroke();

            ctx.beginPath();
            ctx.lineWidth = cs * (wScale * 0.3);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
            ctx.moveTo(cx(points[0].c), cy(points[0].r));
            for (let i = 1; i < points.length; i++) {
                if (points[i - 1].isTPEntry) ctx.moveTo(cx(points[i].c), cy(points[i].r));
                else ctx.lineTo(cx(points[i].c), cy(points[i].r));
            }
            ctx.stroke();
        };

        if (isAnimating) {
            const maxIdx = Math.floor(this.winAnimationPoints.length * animationProgress);
            if (maxIdx > 1) {
                ctx.save(); ctx.shadowBlur = 15; ctx.shadowColor = lineColor;
                drawPoly(this.winAnimationPoints.slice(0, maxIdx)); ctx.restore();
            }
        } else {
            this.userLines.forEach(l => drawPoly(l.points, l.widthScale));

            if (this.currentDragLine) {
                const prevLine = this.userLines.find(l => l.startVal === this.currentDragLine.startVal - 1);
                const dragWidth = this.currentDragLine.widthScale || 0.45;

                if (!prevLine) {
                    drawPoly(this.currentDragLine.points, dragWidth);
                } else {
                    const excludeSet = new Set(prevLine.points.map(p => `${p.r},${p.c}`));
                    const pts = this.currentDragLine.points;

                    if (pts.length > 1) {
                        ctx.lineCap = "round"; ctx.lineJoin = "round";

                        ctx.lineWidth = cs * dragWidth;
                        ctx.strokeStyle = lineColor;
                        ctx.beginPath();
                        for (let i = 0; i < pts.length - 1; i++) {
                            const p1 = pts[i]; const p2 = pts[i + 1];
                            if (excludeSet.has(`${p1.r},${p1.c}`) && excludeSet.has(`${p2.r},${p2.c}`)) continue;
                            if (p1.isTPEntry) continue;
                            ctx.moveTo(cx(p1.c), cy(p1.r));
                            ctx.lineTo(cx(p2.c), cy(p2.r));
                        }
                        ctx.stroke();

                        ctx.lineWidth = cs * (dragWidth * 0.3);
                        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
                        ctx.beginPath();
                        for (let i = 0; i < pts.length - 1; i++) {
                            const p1 = pts[i]; const p2 = pts[i + 1];
                            if (excludeSet.has(`${p1.r},${p1.c}`) && excludeSet.has(`${p2.r},${p2.c}`)) continue;
                            if (p1.isTPEntry) continue;
                            ctx.moveTo(cx(p1.c), cy(p1.r));
                            ctx.lineTo(cx(p2.c), cy(p2.r));
                        }
                        ctx.stroke();
                    }
                }
            }
        }

        ctx.font = `bold ${cs * 0.4}px sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const cell = this.grid[r][c];

                if (this.currentMode === 'words') {
                    const alpha = cell.animAlpha !== undefined ? cell.animAlpha : 1;
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    if (cell.type === 'fixed') {
                        ctx.shadowColor = this.isDarkMode ? "rgba(255,255,255,0.85)" : lineColor;
                        ctx.shadowBlur = cs * 0.2;
                        ctx.shadowOffsetY = 0;
                        ctx.fillStyle = nodeColor; ctx.beginPath();
                        const scale = cell.animScale || 1.0;
                        ctx.arc(cx(c), cy(r), cs * 0.35 * scale, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
                    }
                    ctx.fillStyle = cell.type === 'fixed' ? nodeTextColor : (this.isDarkMode ? "#fff" : "#000");
                    ctx.fillText(cell.letter, cx(c), cy(r));
                    ctx.restore();

                } else if (cell.type === 'fixed') {
                    const alpha = cell.animAlpha !== undefined ? cell.animAlpha : 1;
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    if (cell.val === 1 || cell.val === this.maxNumber) {
                        ctx.shadowColor = this.isDarkMode ? "rgba(255,255,255,0.85)" : lineColor;
                        ctx.shadowBlur = cs * 0.2;
                        ctx.shadowOffsetY = 0;
                    } else {
                        ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 1; ctx.shadowOffsetY = 1;
                    }
                    ctx.fillStyle = nodeColor; ctx.beginPath();
                    const scale = cell.animScale || 1.0;
                    ctx.arc(cx(c), cy(r), cs * 0.35 * scale, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

                    let showText = true;
                    if (this.currentMode === 'blindfold') {
                        if (cell.val !== 1 && cell.val !== this.maxNumber) {
                            showText = false;

                            const prevLine = this.userLines.find(l => l.startVal === cell.val - 1);
                            if (prevLine) {
                                const lastPt = prevLine.points[prevLine.points.length - 1];
                                if (lastPt.r === r && lastPt.c === c) {
                                    showText = true;
                                }
                            }
                        }
                    }

                    if (showText) {
                        ctx.fillStyle = nodeTextColor;
                        ctx.fillText(cell.val, cx(c), cy(r));
                    }
                    ctx.restore();
                }
            }
        }

        // Obstacles hint overlay — drawn every frame so glow loop doesn't erase it
        if (this.obstacleHintPts && this.obstacleHintPts.length >= 2) {
            ctx.save();
            ctx.globalAlpha = 0.65;
            ctx.strokeStyle = this.isDarkMode ? '#FFFF00' : '#FFD700';
            ctx.lineWidth = cs * 0.4;
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(cx(this.obstacleHintPts[0].c), cy(this.obstacleHintPts[0].r));
            for (let i = 1; i < this.obstacleHintPts.length; i++) {
                ctx.lineTo(cx(this.obstacleHintPts[i].c), cy(this.obstacleHintPts[i].r));
            }
            ctx.stroke();
            ctx.restore();
        }

        if (keepAnimating) {
            requestAnimationFrame(() => this.draw());
        }
    }

    // Obstacles drawing helpers

    _roundRect(ctx, x, y, w, h, r) {
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    drawObstacleWalls(ctx, cs) {
        const wallColor = this.isDarkMode ? '#f97316' : '#c2410c';
        ctx.strokeStyle = wallColor;
        ctx.lineCap = 'square';
        const W = Math.max(4, cs * 0.12);
        ctx.lineWidth = W;

        for (const w of this.obstacleWalls) {
            ctx.beginPath();
            if (w.side === 'right') {
                const x = (w.c + 1) * cs;
                ctx.moveTo(x, w.r * cs);
                ctx.lineTo(x, (w.r + 1) * cs);
            } else { // bottom
                const y = (w.r + 1) * cs;
                ctx.moveTo(w.c * cs, y);
                ctx.lineTo((w.c + 1) * cs, y);
            }
            ctx.stroke();
        }
        ctx.lineCap = 'round';
    }

    // Distinct colors per TP pair so connected portals are visually linked
    _tpPairColor(pair) {
        const palette = ['#a855f7', '#06b6d4', '#f59e0b', '#10b981'];
        return palette[pair % palette.length];
    }

    // Pair-specific icon shape: same shape = same pair = same destination
    _drawTPPairIcon(ctx, pair, s) {
        ctx.beginPath();
        switch (pair % 4) {
            case 0: // Triangle ▲
                ctx.moveTo(0, -s);
                ctx.lineTo(s * 0.866, s * 0.5);
                ctx.lineTo(-s * 0.866, s * 0.5);
                ctx.closePath();
                ctx.fill();
                break;
            case 1: // 5-pointed star ★
                for (let i = 0; i < 10; i++) {
                    const angle = (i * Math.PI / 5) - Math.PI / 2;
                    const rr = i % 2 === 0 ? s : s * 0.4;
                    if (i === 0) ctx.moveTo(rr * Math.cos(angle), rr * Math.sin(angle));
                    else ctx.lineTo(rr * Math.cos(angle), rr * Math.sin(angle));
                }
                ctx.closePath();
                ctx.fill();
                break;
            case 2: // Diamond ◆
                ctx.moveTo(0, -s);
                ctx.lineTo(s * 0.65, 0);
                ctx.lineTo(0, s);
                ctx.lineTo(-s * 0.65, 0);
                ctx.closePath();
                ctx.fill();
                break;
            case 3: // Circle ●
                ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2);
                ctx.closePath();
                ctx.fill();
                break;
        }
    }

    drawObstacleTeleporters(ctx, cs, cx, cy) {
        const pulse = 0.5 + 0.5 * Math.sin(this.obstacleTPGlowPhase * Math.PI * 2);

        for (const tp of this.obstacleTeleporters) {
            const tpColor = this._tpPairColor(tp.pair);
            const x = tp.c * cs, y = tp.r * cs;
            const pad = cs * 0.15;
            const w = cs - pad * 2, h = cs - pad * 2;
            const r = cs * 0.12;

            ctx.save();
            // Glow
            ctx.shadowColor = tpColor;
            ctx.shadowBlur = 8 + pulse * 12;
            ctx.globalAlpha = 0.25 + pulse * 0.35;
            ctx.fillStyle = tpColor;
            this._roundRect(ctx, x + pad, y + pad, w, h, r);
            ctx.fill();

            // Border
            ctx.globalAlpha = 0.6 + pulse * 0.4;
            ctx.shadowBlur = 0;
            ctx.strokeStyle = tpColor;
            ctx.lineWidth = 2;
            this._roundRect(ctx, x + pad, y + pad, w, h, r);
            ctx.stroke();
            ctx.restore();

            // Pair icon: same icon = same pair = same destination
            ctx.save();
            ctx.fillStyle = this.isDarkMode ? '#fff' : '#1e293b';
            ctx.globalAlpha = 0.9;
            ctx.translate(cx(tp.c), cy(tp.r));
            this._drawTPPairIcon(ctx, tp.pair, cs * 0.22);
            ctx.restore();
        }
    }

    triggerWinSequence() {
        this.isWinning = true;
        if (this.currentMode === 'speedrun') this.stopSpeedrun();
        if (this.currentMode === 'obstacles') this.stopObstacleGlow();
        const pathLines = this.userLines;

        this.winAnimationPoints = [];
        pathLines.forEach(line => { this.winAnimationPoints.push(...line.points); });
        this.winFrame = 0; this.totalWinFrames = 120;
        requestAnimationFrame(() => this.animateWinLoop());
    }

    animateWinLoop() {
        if (!this.isWinning) return;
        this.winFrame++;
        const progress = this.winFrame / this.totalWinFrames;
        this.draw(true, progress);
        if (this.winFrame < this.totalWinFrames) { requestAnimationFrame(() => this.animateWinLoop()); }
        else { setTimeout(() => this.handleLevelComplete(), 500); }
    }

    triggerTileAnimation(r, c) {
        const cell = this.grid[r][c];
        let frame = 0;
        const maxFrames = 15;
        const amplitude = 0.35;

        const animate = () => {
            frame++;
            const progress = frame / maxFrames;

            if (progress >= 1) {
                cell.animScale = 1.0;
                this.draw();
                return;
            }

            cell.animScale = 1.0 + Math.sin(progress * Math.PI) * amplitude;

            this.draw();
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    startCelebration() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (!this.settings.confetti) return;
        this.isCelebrating = true;
        this.confettiCanvas.classList.add('active');
        this.confettiCanvas.width = window.innerWidth;
        this.confettiCanvas.height = window.innerHeight;

        this.confettiParticles = [];
        for (let i = 0; i < 150; i++) {
            this.confettiParticles.push(this.createParticle());
        }
        this.animateConfetti();
    }

    stopCelebration() {
        this.isCelebrating = false;
        this.confettiCanvas.classList.remove('active');
        this.confettiCtx.clearRect(0, 0, this.confettiCanvas.width, this.confettiCanvas.height);
    }

    createParticle() {
        const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff'];
        return {
            x: Math.random() * this.confettiCanvas.width,
            y: Math.random() * this.confettiCanvas.height - this.confettiCanvas.height,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 10 + 5,
            vx: Math.random() * 4 - 2,
            vy: Math.random() * 4 + 4,
            rotation: Math.random() * 360,
            rotationSpeed: Math.random() * 10 - 5
        };
    }

    animateConfetti() {
        if (!this.isCelebrating) return;

        const ctx = this.confettiCtx;
        const width = this.confettiCanvas.width;
        const height = this.confettiCanvas.height;

        ctx.clearRect(0, 0, width, height);

        this.confettiParticles.forEach(p => {
            p.y += p.vy;
            p.x += p.vx;
            p.rotation += p.rotationSpeed;

            if (p.y > height) {
                p.y = -20;
                p.x = Math.random() * width;
            }

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation * Math.PI / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
        });

        requestAnimationFrame(() => this.animateConfetti());
    }

    showToast(message, duration = 3000) {
        if (!this.settings.toasts) return;
        let container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerText = message;

        container.appendChild(toast);

        void toast.offsetWidth;

        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');

            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 400);

        }, duration);
    }

    // Settings Methods
    loadSettings() {
        const defaults = { toasts: true, confetti: true, cursorTrail: true };
        try {
            const saved = JSON.parse(localStorage.getItem('gameSettings') || '{}');
            return { ...defaults, ...saved };
        } catch {
            return defaults;
        }
    }

    saveSettings() {
        localStorage.setItem('gameSettings', JSON.stringify(this.settings));
    }

    applyCursorTrailSetting() {
        if (!this.cursorDot || !this.cursorTrailCanvas) return;
        if (this.settings.cursorTrail) {
            this.cursorDot.style.display = '';
            this.cursorTrailCanvas.style.display = '';
            document.body.classList.remove('no-cursor-trail');
        } else {
            this.cursorDot.style.display = 'none';
            this.cursorTrailCanvas.style.display = 'none';
            document.body.classList.add('no-cursor-trail');
        }
    }

    initSettings() {
        const modal = document.getElementById('settings-modal');
        const closeBtn = document.getElementById('close-settings-btn');
        const toastsToggle = document.getElementById('settings-toasts');
        const confettiToggle = document.getElementById('settings-confetti');
        const cursorTrailToggle = document.getElementById('settings-cursor-trail');

        toastsToggle.checked = this.settings.toasts;
        confettiToggle.checked = this.settings.confetti;
        cursorTrailToggle.checked = this.settings.cursorTrail;
        this.applyCursorTrailSetting();

        document.getElementById('profile-settings-btn').addEventListener('click', () => {
            document.getElementById('profile-modal').classList.remove('open');
            modal.classList.add('open');
        });
        closeBtn.addEventListener('click', () => modal.classList.remove('open'));
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

        toastsToggle.addEventListener('change', () => {
            this.settings.toasts = toastsToggle.checked;
            this.saveSettings();
        });
        confettiToggle.addEventListener('change', () => {
            this.settings.confetti = confettiToggle.checked;
            this.saveSettings();
        });
        cursorTrailToggle.addEventListener('change', () => {
            this.settings.cursorTrail = cursorTrailToggle.checked;
            this.saveSettings();
            this.applyCursorTrailSetting();
        });
    }

    // Misc Methods
    initContact() {
        const contactDiv = document.getElementById('contact-corner');
        const email = "luongdtran06@gmail.com";

        if (this.isMobile) {
            contactDiv.innerHTML = "✉️";
            contactDiv.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(email);
                    alert("Email copied to clipboard: " + email);
                } catch (err) {
                    alert("Contact me at: " + email);
                }
            };
        } else {
            contactDiv.innerHTML = `<a href="mailto:${email}">Contact: ${email}</a>`;
        }
    }

    initTheme() {
        const savedTheme = localStorage.getItem('theme');
        const systemMedia = window.matchMedia('(prefers-color-scheme: dark)');

        if (savedTheme) {
            this.isDarkMode = (savedTheme === 'dark');
        } else {
            this.isDarkMode = systemMedia.matches;
        }

        this.applyTheme();

        systemMedia.addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                this.isDarkMode = e.matches;
                this.applyTheme();
                this.draw();
            }
        });
    }

    applyTheme() {
        document.body.classList.toggle('dark-mode', this.isDarkMode);

        document.getElementById('theme-toggle').innerText = this.isDarkMode ? "☀️" : "🌙";

        const favicon = document.getElementById('dynamic-favicon');
        if (favicon) {
            favicon.href = this.isDarkMode ? "favicon_light.svg" : "favicon_dark.svg";
        }
    }

    toggleTheme() {
        this.isDarkMode = !this.isDarkMode;

        localStorage.setItem('theme', this.isDarkMode ? 'dark' : 'light');

        this.applyTheme();
        this.draw();
    }

    setRandomColor() {
        const randomIndex = Math.floor(Math.random() * this.colors.length);
        const newColor = this.colors[randomIndex];
        document.documentElement.style.setProperty('--line-color', newColor);
    }

    checkOrientation() {
        if (!this.isMobile) return;

        const overlay = document.getElementById('orientation-lock');
        if (window.innerWidth > window.innerHeight) {
            overlay.style.display = 'flex';
        } else {
            overlay.style.display = 'none';
        }
    }

    removeSplashScreen() {
        const webSplash = document.getElementById('web-splash');
        if (webSplash) {
            webSplash.classList.add('hidden');
            setTimeout(() => webSplash.remove(), 500);
        }
    }
}

window.onload = () => { window.game = new Game(); };