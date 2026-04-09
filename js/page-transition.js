/**
 * I.R.I.S — Cinematic Page Transition Engine (V14 - SNAPPY & TYPING)
 * Minimal Blur (5px) & High-Speed Typewriter (30ms).
 */

'use strict';

const PageTransition = (() => {
    // ── Configuration ──
    const PAGE_NAMES = {
        'dashboard.html':        'Dashboard',
        'students.html':         'Intern Directory',
        'student-profile.html':  'Student Profile',
        'admin-profile.html':    'My Profile',
        'profile-builder.html':  'Profile Builder',
        'leaderboard.html':      'Leaderboard',
        'projects.html':         'Project Showcase',
        'doubts.html':           'The Wall',
        'report-submission.html':'Report Submission',
        'student-analytics.html':'Analytics',
        'login.html':            'Login',
        'info.html':             'Info',
    };

    const DEPARTURE_DELAY = 850; 
    const ARRIVAL_HOLD    = 600;  
    const TYPING_SPEED    = 30; // 30ms per character
    const EXCLUDE_SELECTORS = ['[target="_blank"]', '[href^="#"]', '[href^="javascript:"]', '.no-transition'];

    let loader = null;
    let pageName = null;
    let isNavigating = false;
    let arrivalDone = false; // ✅ module-level flag for absolute safety
    let arrivalHandled = false; // ✅ flag for buildOverlay local scope
    let typeInterval = null;

    // ── Build Overlay ──
    function buildOverlay() {
        const existing = document.getElementById('page-loader');
        if (existing) {
            loader = existing;
            pageName = document.getElementById('pageName');
            return; // ✅ DO NOT rebuild or re-init if already here
        }

        loader = document.createElement('div');
        loader.id = 'page-loader';
        loader.className = 'page-transition-overlay'; 
        loader.innerHTML = `<div class="ipl-page-name" id="pageName"></div>`;

        const isLogin = window.location.pathname.endsWith('login.html');
        if (isLogin) {
            sessionStorage.removeItem('transition');
            sessionStorage.removeItem('transitionPlayed');
        }

        const transitionLabel = sessionStorage.getItem('transition');
        const alreadyPlayed = sessionStorage.getItem('transitionPlayed');

        if (transitionLabel && alreadyPlayed === 'false' && !isLogin) {
            loader.classList.add('active'); 
            document.documentElement.style.overflow = 'hidden';
        }

        const inject = () => {
            if (arrivalHandled) return; // ✅ Block race between observer + body check
            arrivalHandled = true;

            if (document.body) {
                document.body.prepend(loader);
                pageName = document.getElementById('pageName');
                handleArrival();
            }
        };

        if (document.body) inject();
        else {
            const observer = new MutationObserver(() => {
                if (document.body) {
                    observer.disconnect();
                    inject();
                }
            });
            observer.observe(document.documentElement, { childList: true });
        }
    }

    // ── Typewriter Helper ──
    function typeText(element, text, callback) {
        // ✅ Cancel any previous timeouts stored globally
        if (window.__typeTextTimeout__) {
            clearTimeout(window.__typeTextTimeout__);
            window.__typeTextTimeout__ = null;
        }

        element.textContent = ''; // Clear for safety
        element.style.opacity = '1';

        let i = 0;
        function type() {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
                window.__typeTextTimeout__ = setTimeout(type, TYPING_SPEED);
            } else {
                window.__typeTextTimeout__ = null;
                if (callback) callback();
            }
        }

        type();
    }

    // ── Departure logic (Page A) ──
    function navigateTo(href, customLabel) {
        if (isNavigating) return;
        isNavigating = true;

        const label = customLabel || getLabelFor(href);

        sessionStorage.setItem('transition', label);
        sessionStorage.setItem('transitionPlayed', 'false');

        if (loader) {
            loader.classList.remove('ipl-hiding');
            loader.classList.add('active');
        }

        if (pageName) {
            // ✅ Force clear state before typing
            pageName.textContent = '';
            if (window.__typeTextTimeout__) {
                clearTimeout(window.__typeTextTimeout__);
                window.__typeTextTimeout__ = null;
            }
            typeText(pageName, label);
        }

        setTimeout(() => { window.location.href = href; }, DEPARTURE_DELAY);
    }

    // ── Arrival logic (Page B) ──
    function handleArrival() {
        if (arrivalDone || window.__pageTransitionDone) return; // ✅ module + window guards for absolute safety
        arrivalDone = true;
        window.__pageTransitionDone = true;

        const transitionLabel = sessionStorage.getItem('transition');
        const alreadyPlayed = sessionStorage.getItem('transitionPlayed');
        const isLogin = window.location.pathname.endsWith('login.html');

        // ✅ Mark played & clear immediately to prevent any re-entry
        sessionStorage.setItem('transitionPlayed', 'true');
        sessionStorage.removeItem('transition');

        // ✅ No transition to show — reveal instantly
        if (!transitionLabel || alreadyPlayed === 'true' || isLogin) {
            revealPage();
            performFadeOut();
            return;
        }

        // ✅ Type the label exactly once
        if (pageName) {
            typeText(pageName, transitionLabel);
        }

        // ✅ Single finalize guard
        let finalized = false;
        const finalize = () => {
            if (finalized) return; // ✅ blocks any double call
            finalized = true;
            revealPage();
            setTimeout(performFadeOut, ARRIVAL_HOLD);
        };

        if (document.readyState === 'complete') {
            finalize();
        } else {
            // ✅ Use { once: true } so it can never fire twice
            window.addEventListener('load', finalize, { once: true });
        }

        // ✅ Failsafe — also blocked by finalized flag
        setTimeout(finalize, 1500);
    }

    function revealPage() {
        document.body.classList.add('ready');
        document.documentElement.style.overflow = '';
    }

    function performFadeOut() {
        if (!loader || !pageName) return;
        
        pageName.style.opacity = '0';
        pageName.style.transform = 'scale(1.04)';
        pageName.style.transition = 'opacity 0.6s ease, transform 0.6s ease';

        setTimeout(() => {
            if (loader) {
                loader.classList.add('ipl-hiding');
                loader.classList.remove('active');
            }
        }, 150);

        // ✅ Final explicit removal to ensure no blocking
        setTimeout(() => {
            if (loader) {
                loader.style.display = 'none';
            }
        }, 800); 
    }

    function getLabelFor(href) {
        try {
            const url = new URL(href, window.location.href);
            const file = url.pathname.split('/').pop() || 'dashboard.html';
            return (PAGE_NAMES[file] || file.replace('.html', '').replace(/-/g, ' ')).toUpperCase();
        } catch { return 'IRIS'; }
    }

    function init() {
        buildOverlay();
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link || !link.href || e.defaultPrevented) return;
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

            const isExcluded = EXCLUDE_SELECTORS.some(sel => {
                try { return link.matches(sel); } catch { return false; }
            });
            if (isExcluded) return;

            const url = new URL(link.href, window.location.href);
            if (url.origin !== window.location.origin) return;
            if (url.pathname === window.location.pathname && url.search === window.location.search) return;
            
            e.preventDefault();
            navigateTo(link.href);
        });
    }

    return { init, navigateTo };
})();

PageTransition.init();
