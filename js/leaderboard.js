/**
 * InternTrack — Leaderboard Logic
 * Filters: Overall, Demo Projects, Live Projects, Rating
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
    // ── Auth Guard ──
    const session = Auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
        return;
    }

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

    let currentFilter = 'overall';
    let searchQuery = '';

    const FILTERS = {
        overall: { sort: (a, b) => (b.points - a.points) || a.name.localeCompare(b.name), label: 'Global Points', icon: 'stars', header: 'Points' },
        demo: { sort: (a, b) => (b.demoCount - a.demoCount) || a.name.localeCompare(b.name), label: 'Demo Projects', icon: 'science', header: 'Demos' },
        live: { sort: (a, b) => (b.liveCount - a.liveCount) || a.name.localeCompare(b.name), label: 'Live Projects', icon: 'rocket_launch', header: 'Live' },
        rating: { sort: (a, b) => (b.avgRating - a.avgRating) || a.name.localeCompare(b.name), label: 'Rating Based', icon: 'grade', header: 'Avg Rating' },
    };

    // ── Helper: Reliable Badge Image Resolver ──
    function getInternBadgeImage(intern) {
        if (!BadgeEngine || !BadgeEngine.BADGES) return 'badges/Bronze.png';
        
        const bList = (intern.badges && intern.badges.length > 0 ? intern.badges : ['bronze'])
                      .map(b => (typeof b === 'string' ? b.trim().toLowerCase() : 'bronze'));
        
        // Find highest earned
        const earned = BadgeEngine.BADGES.filter(b => bList.includes(b.id)).sort((a,b) => b.order - a.order);
        if (earned.length > 0) return earned[0].image;

        // Ultimate fallback
        return 'badges/Bronze.png';
    }

    // ── Main Render Logic ──
    function render() {
        const profiles = Storage.getProfiles();
        const projects = Storage.getProjects();
        const interns = Object.values(profiles).filter(p => !p.role || p.role === 'user');
        
        const enriched = interns.map(p => {
            const myProjs = projects.filter(pr => String(pr.userId || pr.ownerId) === String(p.userId));
            const liveCount = myProjs.filter(pr => pr.liveLink && (pr.liveLinkType === 'Live' || !pr.liveLinkType)).length;
            const demoCount = myProjs.filter(pr => !pr.liveLink || pr.liveLinkType === 'Demo').length;
            const metrics = Storage.getProfileMetrics(p);
            return { ...p, points: metrics.points || 0, avgRating: metrics.rating || 0, liveCount, demoCount };
        });

        if (totalCount) totalCount.textContent = enriched.length;

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
            podiumEl.innerHTML = '<p class="text-muted">No interns found.</p>';
            return;
        }
        
        const top3 = [sorted[1], sorted[0], sorted[2]];
        const ranks = [2, 1, 3];
        const classPos = ['rank-2', 'rank-1', 'rank-3'];

        podiumEl.innerHTML = top3.map((intern, i) => {
            if (!intern) return '<div style="width:140px; visibility:hidden;"></div>';
            const rank = ranks[i];
            const badgeImg = getInternBadgeImage(intern);

            return `
                <div class="lb-podium-card ${classPos[i]} card-3d">
                    <div class="glare"></div>
                    ${rank === 1 ? '<span class="lb-crown">👑</span>' : ''}
                    <div class="lb-podium-avatar-wrap" onclick="window.location.href='student-analytics.html?student=${intern.userId}'" style="cursor:pointer">
                        <div class="lb-podium-avatar">${intern.avatar ? `<img src="${intern.avatar}">` : `<span>${intern.name[0]}</span>`}</div>
                        <div class="lb-rank-badge" style="background:transparent; border:none; width:45px; height:45px; bottom:-12px; right:-12px;">
                            <img src="${badgeImg}" style="width:100%; height:100%; object-fit:contain; filter:drop-shadow(0 0 8px rgba(0,0,0,0.4))">
                        </div>
                    </div>
                    <div class="lb-podium-info">
                        <div class="lb-podium-name">${intern.name}</div>
                        <div class="lb-podium-score-wrap">
                            <div class="lb-podium-score">${getVal(intern)}</div>
                            <div class="lb-podium-score-label">${FILTERS[currentFilter].header}</div>
                        </div>
                    </div>
                    <div class="lb-podium-stand"><span class="lb-stand-rank">${rank}</span></div>
                </div>
            `;
        }).join('');
    }

    function renderTable(sorted) {
        if (!tableBody) return;
        const rest = sorted.length > 3 ? sorted.slice(3) : sorted;
        
        tableBody.innerHTML = rest.map((intern, i) => {
            const rank = sorted.indexOf(intern) + 1;
            const badgeImg = getInternBadgeImage(intern);
            const stars = Array.from({ length: 5 }, (_, s) => `<span class="lb-star ${s < Math.round(intern.avgRating) ? 'on' : ''}">★</span>`).join('');

            return `
                <div class="lb-table-row card-3d">
                    <div class="lb-row-rank" style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:12px; opacity:0.6;">#${rank}</span>
                        <img src="${badgeImg}" style="width:28px; height:28px; object-fit:contain;">
                    </div>
                    <div class="lb-row-name" style="cursor:pointer" onclick="window.location.href='student-analytics.html?student=${intern.userId}'">
                        <div class="lb-row-avatar">${intern.avatar ? `<img src="${intern.avatar}">` : intern.name[0]}</div>
                        <div>
                          <div class="lb-row-intern-name">${intern.name}</div>
                          <div class="lb-row-intern-role">${intern.internship?.role || 'Technical Intern'}</div>
                        </div>
                    </div>
                    <div class="lb-row-score" style="color:var(--clr-accent)">${getVal(intern)}</div>
                    <div class="lb-row-projects">
                      <div class="lb-proj-badge"><span class="dot live"></span>${intern.liveCount} Live</div>
                      <div class="lb-proj-badge"><span class="dot demo"></span>${intern.demoCount} Demo</div>
                    </div>
                    <div class="lb-row-rating"><div class="lb-stars">${stars}</div></div>
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
    if (searchInput) searchInput.addEventListener('input', (e) => { searchQuery = e.target.value; render(); });
    if (filterBtn) filterBtn.addEventListener('click', () => filterMenu.classList.toggle('visible'));
    if (filterMenu) filterMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.lb-dropdown-item');
        if (item) {
            currentFilter = item.dataset.filter;
            currentFilterLabel.textContent = FILTERS[currentFilter].label;
            currentFilterIcon.textContent = FILTERS[currentFilter].icon;
            filterMenu.classList.remove('visible');
            render();
        }
    });

    SidebarEngine.init();
    render();
});
