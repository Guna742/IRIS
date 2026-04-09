/**
 * InternTrack — Leaderboard Logic
 * Filters: Overall, Demo Projects, Live Projects, Rating
 */

'use strict';

(() => {
    // ── Auth Guard ──
    const session = Auth.requireAuth();
    if (!session) return;

    // ── Configuration ──
    const isAdmin = session.role === 'admin';

    // ── Sync latest data ──
    if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
        Storage.fetchEverything();
    }

    // ── Real-time Listener ──
    window.addEventListener('iris-data-sync', (e) => {
        console.log('[Leaderboard] Data sync received: ' + e.detail.type);
        render(); 
    });

    // ── DOM Refs ──
    const podiumEl = document.getElementById('lb-podium');
    const tableBody = document.getElementById('lb-table-body');
    const totalCount = document.getElementById('lb-total-count');
    const scoreHeader = document.getElementById('lb-score-header');
    const searchInput = document.getElementById('lb-search-input');
    const filterBtn = document.getElementById('lb-filter-btn');
    const filterMenu = document.getElementById('lb-filter-menu');
    const currentFilterIcon = document.getElementById('lb-current-filter-icon');
    const currentFilterLabel = document.getElementById('lb-current-filter-label');
    const logoutBtn = document.getElementById('logout-btn');

    let currentFilter = 'overall';
    let searchQuery = '';

    const FILTERS = {
        overall: { sort: (a, b) => (b.points - a.points) || a.name.localeCompare(b.name), label: 'Global Points', icon: 'stars', header: 'Points' },
        demo: { sort: (a, b) => (b.demoCount - a.demoCount) || a.name.localeCompare(b.name), label: 'Demo Projects', icon: 'science', header: 'Demos' },
        live: { sort: (a, b) => (b.liveCount - a.liveCount) || a.name.localeCompare(b.name), label: 'Live Projects', icon: 'rocket_launch', header: 'Live' },
        rating: { sort: (a, b) => (b.avgRating - a.avgRating) || a.name.localeCompare(b.name), label: 'Rating Based', icon: 'grade', header: 'Avg Rating' },
    };

    // ── Main Render Logic ──
    function render() {
        console.log('[Leaderboard] Rendering premium sequence...');
        
        const profiles = Storage.getProfiles();
        const projects = Storage.getProjects();
        const now = Date.now();
        
        // Filter out suspended interns
        const interns = Object.values(profiles).filter(p => !p.suspendedUntil || p.suspendedUntil < now);
        
        // Enrich data
        const enriched = interns.map(p => {
            const myProjs = projects.filter(pr => String(pr.userId || pr.ownerId) === String(p.userId));
            const liveCount = myProjs.filter(pr => pr.liveLink && (pr.liveLinkType === 'Live' || !pr.liveLinkType)).length;
            const demoCount = myProjs.filter(pr => !pr.liveLink || pr.liveLinkType === 'Demo').length;
            
            // Use metrics if available, otherwise calculate
            const metrics = Storage.getProfileMetrics(p);
            const score = metrics.score;
            const points = metrics.points;
            const avgRating = metrics.rating;
            
            return { ...p, score, points, avgRating, liveCount, demoCount, totalProjects: myProjs.length };
        });

        if (totalCount) totalCount.textContent = enriched.length;

        // Apply Search & Filter
        let sorted = [...enriched];
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            sorted = sorted.filter(p => (p.name || '').toLowerCase().includes(q));
        }
        sorted.sort(FILTERS[currentFilter].sort);

        renderPodium(sorted);
        renderTable(sorted);
        if (scoreHeader) scoreHeader.textContent = FILTERS[currentFilter].header;
    }

    function renderPodium(sorted) {
        if (!podiumEl) return;
        if (sorted.length === 0) {
            podiumEl.innerHTML = `
                <div class="lb-empty-state" style="grid-column: 1/-1; text-align:center; padding:40px;">
                    <span class="material-symbols-outlined" style="font-size: 48px; color: var(--clr-text-muted);">group_off</span>
                    <p style="color: var(--clr-text-muted);">Fetching the championship ranks...</p>
                </div>
            `;
            podiumEl.style.display = 'grid';
            return;
        }
        podiumEl.style.display = 'flex';
        
        const top3 = [sorted[1], sorted[0], sorted[2]]; // 2nd, 1st, 3rd
        const medals = ['silver', 'gold', 'bronze'];
        const ranks = [2, 1, 3];
        const standPos = ['rank-2', 'rank-1', 'rank-3'];

        podiumEl.innerHTML = top3.map((intern, i) => {
            if (!intern) return '<div class="lb-podium-card card-3d" style="visibility:hidden; width:140px"></div>';
            const rank = ranks[i];
            return `
                <div class="lb-podium-card ${standPos[i]} card-3d" aria-label="Rank ${rank}: ${intern.name}" style="animation-delay: ${rank * 0.2}s">
                    <div class="glare" aria-hidden="true"></div>
                    ${rank === 1 ? '<span class="lb-crown">👑</span>' : ''}
                    <div class="lb-podium-avatar-wrap" style="cursor:pointer" onclick="window.location.href='student-analytics.html?student=${intern.userId}'">
                      <div class="lb-podium-avatar">${intern.avatar ? `<img src="${intern.avatar}">` : `<span>${intern.name[0]}</span>`}</div>
                      <div class="lb-rank-badge ${medals[i]}">#${rank}</div>
                    </div>
                    <div class="lb-podium-info">
                        <div class="lb-podium-name" style="cursor:pointer" onclick="window.location.href='student-analytics.html?student=${intern.userId}'">${intern.name}</div>
                        <div class="lb-podium-score-wrap">
                            <div class="lb-podium-score">${getVal(intern)}</div>
                            <div class="lb-podium-score-label">${FILTERS[currentFilter].header}</div>
                        </div>
                    </div>
                    <div class="lb-podium-stand">
                      <span class="lb-stand-rank">${rank}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderTable(sorted) {
        if (!tableBody) return;
        const isSearch = !!searchQuery.trim();
        const rest = sorted.length > 3 && !isSearch ? sorted.slice(3) : sorted;
        
        if (rest.length === 0 && sorted.length > 0) {
            tableBody.innerHTML = `<div class="lb-empty" style="padding:40px; text-align:center; color: var(--clr-text-muted)">All interns are currently on the podium.</div>`;
            return;
        }

        tableBody.innerHTML = rest.map((intern, i) => {
            const rank = sorted.indexOf(intern) + 1;
            const stars = Array.from({ length: 5 }, (_, s) => `<span class="lb-star ${s < Math.round(intern.avgRating) ? 'on' : ''}">★</span>`).join('');
            return `
                <div class="lb-table-row card-3d visible" style="animation-delay: ${i * 0.05}s">
                    <div class="lb-row-rank ${rank <= 5 ? `top-rank rank-${rank}` : ''}">#${rank}</div>
                    <div class="lb-row-name" style="cursor:pointer" onclick="window.location.href='student-analytics.html?student=${intern.userId}'">
                        <div class="lb-row-avatar">${intern.avatar ? `<img src="${intern.avatar}">` : intern.name[0]}</div>
                        <div>
                          <div class="lb-row-intern-name">${intern.name}</div>
                          <div class="lb-row-intern-role">${intern.internship?.role || 'Technical Intern'}</div>
                        </div>
                    </div>
                    <div class="lb-row-score" style="text-align:left; color: var(--clr-accent); font-weight:800;">${getVal(intern)}</div>
                    <div class="lb-row-projects">
                      <div class="lb-proj-badge"><span class="dot live"></span>${intern.liveCount} Live</div>
                      <div class="lb-proj-badge"><span class="dot demo"></span>${intern.demoCount} Demo</div>
                    </div>
                    <div class="lb-row-rating">
                      <div class="lb-stars">${stars}</div>
                    </div>
                    <div class="glare" aria-hidden="true"></div>
                </div>
            `;
        }).join('');
    }

    function getVal(intern) {
        if (currentFilter === 'overall') return `${intern.points} XP`;
        if (currentFilter === 'demo') return intern.demoCount;
        if (currentFilter === 'live') return intern.liveCount;
        if (currentFilter === 'rating') return `${intern.avgRating}★`;
        return 0;
    }

    // ── Events ──
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            render();
        });
    }

    if (filterBtn) {
        filterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = filterMenu.classList.contains('visible');
            if (isVisible) {
                filterMenu.classList.remove('visible');
                filterBtn.setAttribute('aria-expanded', 'false');
            } else {
                filterMenu.classList.add('visible');
                filterBtn.setAttribute('aria-expanded', 'true');
            }
        });
    }

    if (filterMenu) {
        filterMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.lb-dropdown-item');
            if (item) {
                currentFilter = item.dataset.filter;
                // Update active states
                filterMenu.querySelectorAll('.lb-dropdown-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');

                const filterData = FILTERS[currentFilter];
                if (currentFilterLabel) currentFilterLabel.textContent = filterData.label;
                if (currentFilterIcon) {
                    currentFilterIcon.textContent = filterData.icon;
                    currentFilterIcon.className = 'material-symbols-outlined';
                }
                
                filterMenu.classList.remove('visible');
                filterBtn.setAttribute('aria-expanded', 'false');
                render();
            }
        });
    }

    // Close menu on outside click
    document.addEventListener('click', () => {
        if (filterMenu && filterMenu.classList.contains('visible')) {
            filterMenu.classList.remove('visible');
            if (filterBtn) filterBtn.setAttribute('aria-expanded', 'false');
        }
    });

    // ── Initialize ──
    SidebarEngine.init();
    render();

    if (logoutBtn) logoutBtn.addEventListener('click', () => Auth.logout());
    
    // ── Mission Tracking ──
    if (Storage?.markMissionVisited) {
        Storage.markMissionVisited('leaderboard', session.userId);
    }
    
    // Aesthetic Polish
    const colors = ['#8b5cf6', '#7c5cfc', '#22d3ee', '#a855f7', '#FFD700'];
    for (let i = 0; i < 15; i++) {
        const p = document.createElement('div');
        p.className = 'lb-particle';
        p.style.cssText = `
            left: ${Math.random() * 100}%; background: ${colors[Math.floor(Math.random() * colors.length)]};
            animation-duration: ${8 + Math.random() * 12}s; animation-delay: ${Math.random() * 10}s;
            width: ${2 + Math.random() * 4}px; height: ${2 + Math.random() * 4}px; box-shadow: 0 0 6px currentColor;
        `;
        document.body.appendChild(p);
    }

})();
