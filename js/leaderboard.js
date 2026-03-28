/**
 * InternTrack — Leaderboard Logic
 * Filters: Overall, Demo Projects, Live Projects, Rating
 */

'use strict';

(async () => {
    if (window.LeaderboardInitialized) {
        console.log('Leaderboard already initialized, skipping.');
        return;
    }
    window.LeaderboardInitialized = true;
    console.log('Leaderboard logic initializing...');

    // ── Auth Guard ──
    const session = Auth.requireAuth();
    if (!session) return;

    // Fetch latest data from Firestore before first render
    if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
        await Storage.fetchEverything();
    }

    const isAdmin = session.role === 'admin';

    // Refresh rank-based badges
    if (!isAdmin && typeof BadgeEngine !== 'undefined') {
        BadgeEngine.refreshBadges(session.userId);
    }

    // ── DOM Refs ──
    const sidebarNav = document.getElementById('sidebar-nav');
    const userAvatarSb = document.getElementById('user-avatar-sidebar');
    const userNameSb = document.getElementById('user-name-sidebar');
    const userRoleSb = document.getElementById('user-role-sidebar');
    const topbarBadge = document.getElementById('topbar-role-badge');
    const logoutBtn = document.getElementById('logout-btn');
    const podiumEl = document.getElementById('lb-podium');
    const tableBody = document.getElementById('lb-table-body');
    const scoreHeader = document.getElementById('lb-score-header');
    const totalCount = document.getElementById('lb-total-count');

    const filterBtn = document.getElementById('lb-filter-btn');
    const filterMenu = document.getElementById('lb-filter-menu');
    const currentFilterIcon = document.getElementById('lb-current-filter-icon');
    const currentFilterLabel = document.getElementById('lb-current-filter-label');
    const searchInput = document.getElementById('lb-search-input');

    // ── User Info ──
    const profile = isAdmin
        ? (Storage.getAdminProfile ? Storage.getAdminProfile(session.userId) : null)
        : Storage.getProfile(session.userId);
    const currentName = profile?.name || session.displayName;
    const currentAvatar = profile?.avatar || '';

    if (userAvatarSb) {
        if (currentAvatar) {
            userAvatarSb.innerHTML = `<img src="${currentAvatar}" alt="${currentName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        } else {
            userAvatarSb.textContent = currentName[0]?.toUpperCase() || 'U';
        }
    }
    if (userNameSb) userNameSb.textContent = currentName;
    if (userRoleSb) userRoleSb.textContent = isAdmin ? (profile?.role || 'Administrator') : 'Intern';
    if (topbarBadge) {
        topbarBadge.textContent = isAdmin ? 'Admin' : 'Intern';
        topbarBadge.className = `badge ${isAdmin ? 'badge-admin' : 'badge-user'}`;
    }

    // ── Sidebar Nav ──
    const NAV_ADMIN = [
        { label: 'Dashboard', href: 'dashboard.html', icon: 'grid_view' },
        { label: 'My Profile', href: 'admin-profile.html', icon: 'person' },
        { label: 'Interns', href: 'students.html', icon: 'group' },
        { label: 'Leaderboard', href: 'leaderboard.html', icon: 'leaderboard', active: true },
        { label: 'Projects', href: 'projects.html', icon: 'folder' },
        { label: 'Doubts', href: 'doubts.html', icon: 'help_center' },
    ];
    const NAV_INTERN = [
        { label: 'Dashboard', href: 'dashboard.html', icon: 'grid_view' },
        { label: 'My Profile', href: 'student-profile.html', icon: 'person' },
        { label: 'Leaderboard', href: 'leaderboard.html', icon: 'leaderboard' },
        { label: 'My Analytics', href: `student-analytics.html?student=${session.userId}`, icon: 'analytics' },
        { label: 'Report Submission', href: 'report-submission.html', icon: 'description' },
        { label: 'Projects', href: 'projects.html', icon: 'folder', active: true },
        { label: 'Doubts', href: 'doubts.html', icon: 'help_center' },
    ];

    const navItems = isAdmin ? NAV_ADMIN : NAV_INTERN;
    let navHTML = `<div class="nav-section-label">Menu</div>`;
    navItems.forEach(item => {
        navHTML += `
          <a class="nav-item${item.active ? ' active' : ''}" href="${item.href}" aria-current="${item.active ? 'page' : 'false'}">
            <span class="nav-icon" aria-hidden="true"><span class="material-symbols-outlined">${item.icon}</span></span>
            <span>${item.label}</span>
          </a>`;
    });
    if (sidebarNav) sidebarNav.innerHTML = navHTML;

    // ── Data Computation ──
    function getEnrichedData() {
        const profiles = Storage.getProfiles();
        const projects = Storage.getProjects();
        const now = Date.now();
        const internList = Object.values(profiles).filter(p => !p.suspendedUntil || p.suspendedUntil < now);

        return internList.map(p => {
            const myProjects = projects.filter(proj => String(proj.ownerId) === String(p.userId));
            
            // Accurate counts based on metadata
            const liveCount = myProjects.filter(pr => 
                (pr.liveLinkType === 'Live' || !pr.liveLinkType) && pr.liveLink && pr.liveLink.trim()
            ).length;
            
            const demoCount = myProjects.filter(pr => 
                pr.liveLinkType === 'Demo' || (!pr.liveLink || !pr.liveLink.trim())
            ).length;

            const score = Storage.computeInternScore(p);
            const rating = parseFloat((score / 20).toFixed(1));
            return { ...p, score, rating, liveCount, demoCount, totalProjects: myProjects.length };
        });
    }

    // ── Filter Sort Logic ──
    let currentFilter = 'overall';
    let searchQuery = '';

    const FILTERS = {
        overall: { sort: (a, b) => (b.score - a.score) || a.name.localeCompare(b.name), label: 'All Overall', icon: 'stars', header: 'Score' },
        demo: { sort: (a, b) => (b.demoCount - a.demoCount) || a.name.localeCompare(b.name), label: 'Demo Projects', icon: 'science', header: 'Demo Projects' },
        live: { sort: (a, b) => (b.liveCount - a.liveCount) || a.name.localeCompare(b.name), label: 'Live Projects', icon: 'rocket_launch', header: 'Live Projects' },
        rating: { sort: (a, b) => (b.rating - a.rating) || a.name.localeCompare(b.name), label: 'Rating Based', icon: 'grade', header: 'Rating' },
    };

    function getFilteredAndSortedData(enrichedData) {
        let data = [...enrichedData];
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            data = data.filter(p => (p.name || '').toLowerCase().includes(q));
        }
        return data.sort(FILTERS[currentFilter].sort);
    }

    function getScoreValue(intern, filter) {
        if (filter === 'overall') return `${intern.score}%`;
        if (filter === 'demo') return intern.demoCount;
        if (filter === 'live') return intern.liveCount;
        if (filter === 'rating') return `${intern.rating}★`;
        return 0;
    }

    // ── Render Podium ──
    function renderPodium(sorted) {
        if (!podiumEl) return;
        if (!sorted.length) {
            podiumEl.innerHTML = '';
            podiumEl.style.display = 'none';
            return;
        }
        podiumEl.style.display = 'flex';
        const positions = [sorted[1], sorted[0], sorted[2]]; // 2nd, 1st, 3rd
        const ranks = [2, 1, 3];
        const medals = ['silver', 'gold', 'bronze'];
        const standPos = ['rank-2', 'rank-1', 'rank-3'];

        podiumEl.innerHTML = positions.map((intern, i) => {
            if (!intern) return '<div class="lb-podium-card" style="visibility:hidden;width:140px"></div>';
            const rank = ranks[i];
            const initial = (intern.name || '?')[0].toUpperCase();
            const avatarHTML = intern.avatar
                ? `<img src="${intern.avatar}" alt="${intern.name}">`
                : `<span>${initial}</span>`;

            return `
              <div class="lb-podium-card ${standPos[i]}" aria-label="Rank ${rank}: ${intern.name}" style="animation-delay: ${rank === 1 ? 0.2 : rank === 2 ? 0.4 : 0.6}s">
                ${rank === 1 ? '<span class="lb-crown">👑</span>' : ''}
                <div class="lb-podium-avatar-wrap">
                  <div class="lb-podium-avatar">${avatarHTML}</div>
                  <div class="lb-rank-badge ${medals[i]}">#${rank}</div>
                </div>
                <div class="lb-podium-name" title="${intern.name}">${intern.name || 'Intern'}</div>
                <div class="lb-podium-score">${getScoreValue(intern, currentFilter)}</div>
                <div class="lb-podium-score-label">${FILTERS[currentFilter].header}</div>
                <div class="lb-podium-stand">
                  <span class="lb-stand-rank">${rank}</span>
                </div>
              </div>`;
        }).join('');
    }

    // ── Render Table ──
    function renderTable(sorted) {
        if (!tableBody) return;
        if (!sorted.length) {
            tableBody.innerHTML = `<div class="lb-empty"><div class="lb-empty-icon"><span class="material-symbols-outlined" style="font-size: 40px;">search_off</span></div><p>No interns found matching "${searchQuery}"</p></div>`;
            return;
        }

        // Show all if searching, otherwise skip top 3
        const isRestricted = !searchQuery.trim() && sorted.length > 3;
        const rest = isRestricted ? sorted.slice(3) : sorted;

        if (!rest.length && sorted.length > 0) {
            tableBody.innerHTML = `<div class="lb-empty"><div class="lb-empty-icon"><span class="material-symbols-outlined" style="font-size: 40px;">emoji_events</span></div><p>All interns are on the podium!</p></div>`;
            return;
        }

        tableBody.innerHTML = rest.map((intern, i) => {
            const rank = sorted.indexOf(intern) + 1;
            const initial = (intern.name || '?')[0].toUpperCase();
            const avatarHTML = intern.avatar
                ? `<img src="${intern.avatar}" alt="${intern.name}">`
                : initial;
            const stars = Array.from({ length: 5 }, (_, s) => `<span class="lb-star ${s < Math.round(intern.rating) ? 'on' : ''}">★</span>`).join('');

            return `
              <div class="lb-table-row" style="animation-delay: ${i * 0.06}s" role="row">
                <div class="lb-row-rank ${rank <= 5 ? `top-rank rank-${rank}` : ''}" role="cell">#${rank}</div>
                <div class="lb-row-name" role="cell">
                  <div class="lb-row-avatar">${avatarHTML}</div>
                  <div>
                    <div class="lb-row-intern-name">${intern.name || 'Intern'}</div>
                    <div class="lb-row-intern-role">${intern.internship?.role || 'Intern'}</div>
                  </div>
                </div>
                <div class="lb-row-score" role="cell">${getScoreValue(intern, currentFilter)}</div>
                <div class="lb-row-projects" role="cell">
                  <div class="lb-proj-badge"><span class="dot live"></span>${intern.liveCount} Live</div>
                  <div class="lb-proj-badge"><span class="dot demo"></span>${intern.demoCount} Demo</div>
                </div>
                <div class="lb-row-rating" role="cell">
                  <div class="lb-stars">${stars}</div>
                  <span class="lb-rating-val">${intern.rating}</span>
                </div>
              </div>`;
        }).join('');
    }

    function updateHeader(filter) {
        if (scoreHeader) scoreHeader.textContent = FILTERS[filter].header;
    }

    function render() {
        console.log('Rendering leaderboard with filter:', currentFilter);
        const enriched = getEnrichedData();
        if (totalCount) totalCount.textContent = enriched.length;
        
        const sorted = getFilteredAndSortedData(enriched);
        renderPodium(sorted);
        renderTable(sorted);
        updateHeader(currentFilter);
    }

    // ── Initial Render ──
    render();

    // ── Search Logic ──
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            render();
        });
    }

    // ── Dropdown Logic (Fixed for Click Conflicts) ──
    if (filterBtn && filterMenu) {

        // Toggle Menu
        filterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = filterBtn.getAttribute('aria-expanded') === 'true';
            filterBtn.setAttribute('aria-expanded', !isOpen);
            filterMenu.classList.toggle('visible');
            console.log('Dropdown toggled. Open:', !isOpen);
        });

        // Close when clicking an item
        filterMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.lb-dropdown-item');
            if (!item) return;

            e.stopPropagation(); // Stop document listener from closing before logic runs

            const filter = item.dataset.filter;
            console.log('Dropdown item selected:', filter);

            if (filter !== currentFilter) {
                // Update Labels
                const filterData = FILTERS[filter];
                if (currentFilterIcon) {
                    currentFilterIcon.textContent = filterData.icon;
                    currentFilterIcon.className = 'material-symbols-outlined';
                }
                if (currentFilterLabel) currentFilterLabel.textContent = filterData.label;

                // Mark Active
                document.querySelectorAll('.lb-dropdown-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                // Update Data
                currentFilter = filter;

                // Animation Trigger
                if (podiumEl) { podiumEl.style.opacity = '0'; podiumEl.style.transform = 'translateY(10px)'; }
                if (tableBody) tableBody.style.opacity = '0';

                setTimeout(() => {
                    render();
                    if (podiumEl) {
                        podiumEl.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
                        podiumEl.style.opacity = '1';
                        podiumEl.style.transform = 'translateY(0)';
                    }
                    if (tableBody) {
                        tableBody.style.transition = 'opacity 0.35s ease';
                        tableBody.style.opacity = '1';
                    }
                }, 100);
            }

            // Always close menu after selection
            filterMenu.classList.remove('visible');
            filterBtn.setAttribute('aria-expanded', 'false');
        });

        // Global Closer (Smart detection)
        document.addEventListener('click', (e) => {
            const isClickInside = filterBtn.contains(e.target) || filterMenu.contains(e.target);
            if (!isClickInside && filterMenu.classList.contains('visible')) {
                filterMenu.classList.remove('visible');
                filterBtn.setAttribute('aria-expanded', 'false');
                console.log('Dropdown closed by outside click.');
            }
        });
    }

    // ── Particles ──
    const colors = ['#8b5cf6', '#7c5cfc', '#22d3ee', '#a855f7', '#FFD700'];
    for (let i = 0; i < 18; i++) {
        const p = document.createElement('div');
        p.className = 'lb-particle';
        p.style.cssText = `
            left: ${Math.random() * 100}%;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            animation-duration: ${8 + Math.random() * 12}s;
            animation-delay: ${Math.random() * 10}s;
            width: ${2 + Math.random() * 4}px;
            height: ${2 + Math.random() * 4}px;
            box-shadow: 0 0 6px currentColor;
        `;
        document.body.appendChild(p);
    }

    // ── Sidebar Toggle ──
    const hamburger = document.getElementById('hamburger-btn');
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (hamburger && sidebar && overlay) {
        hamburger.addEventListener('click', () => {
            const open = sidebar.classList.toggle('open');
            overlay.classList.toggle('visible', open);
            hamburger.setAttribute('aria-expanded', String(open));
        });
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('visible');
            hamburger.setAttribute('aria-expanded', 'false');
        });
    }

    if (logoutBtn) logoutBtn.addEventListener('click', () => Auth.logout());

    // ── Init animations ──
    if (typeof initMagneticButtons === 'function') initMagneticButtons();
    if (typeof initScrollReveals === 'function') initScrollReveals();

})();
