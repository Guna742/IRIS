/**
 * I.R.I.S — Employee Projects Logic
 * Filtered view of projects for the logged-in employee.
 */

'use strict';

(() => {
    const session = Auth.requireAuth(['employee', 'admin']);
    if (!session) return;

    // ── Data Sync ──
    if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
        Storage.fetchEverything();
    }

    window.addEventListener('iris-data-sync', () => {
        render();
    });

    // ── DOM refs ──
    const grid = document.getElementById('projects-grid');
    const statusFilters = document.getElementById('status-filters');
    const newProjectBtn = document.getElementById('new-project-btn');
    let activeStatus = 'all';

    function render() {
        if (!grid) return;
        
        const projects = Storage.getProjects() || [];
        // Strictly filter by viewer's ID (as per request)
        let myProjects = projects.filter(p => (p.userId || p.ownerId) === session.userId);

        if (activeStatus !== 'all') {
            myProjects = myProjects.filter(p => p.status === activeStatus);
        }

        if (myProjects.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1; padding: 60px 20px; text-align: center;">
                    <div class="empty-icon" style="font-size: 48px; opacity: 0.2; margin-bottom: 20px;">
                        <span class="material-symbols-outlined" style="font-size: 64px;">folder_open</span>
                    </div>
                    <h3 style="font-size: 1.25rem; margin-bottom: 8px;">No projects found</h3>
                    <p style="color: var(--clr-text-muted); font-size: 0.9rem;">You haven't added any projects with status "${activeStatus}" yet.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = myProjects.map((p, i) => `
            <article class="project-card anim-reveal visible" style="animation-delay: ${i * 0.1}s">
                <div class="card-img-wrap" style="height: 160px; background: var(--clr-bg-elevated); display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;">
                    ${p.screenshot 
                        ? `<img src="${p.screenshot}" style="width: 100%; height: 100%; object-fit: cover;">` 
                        : `<span class="material-symbols-outlined" style="font-size: 48px; opacity: 0.1;">inventory_2</span>`}
                    <div style="position: absolute; top: 12px; right: 12px;">
                        <span class="badge ${p.status === 'Completed' ? 'badge-success' : 'badge-warning'}" style="font-size: 10px; backdrop-filter: blur(8px);">${p.status || 'Active'}</span>
                    </div>
                </div>
                <div class="card-body" style="padding: 20px;">
                    <h2 class="card-title" style="font-size: 1.1rem; margin-bottom: 8px; font-weight: 700;">${p.title}</h2>
                    <p class="card-desc" style="font-size: 0.85rem; color: var(--clr-text-muted); line-height: 1.5; margin-bottom: 16px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${p.description || 'No description provided.'}</p>
                    <div class="card-stack" style="display: flex; flex-wrap: wrap; gap: 6px;">
                        ${(p.techStack || []).map(t => `<span class="stack-tag" style="font-size: 10px; padding: 2px 8px; background: rgba(255,255,255,0.05); border-radius: 4px; color: var(--clr-accent);">${t}</span>`).join('')}
                    </div>
                </div>
                <div class="card-footer" style="padding: 15px 20px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 10px; color: var(--clr-text-muted);">
                        ${p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'Recent'}
                    </div>
                    <div style="display: flex; gap: 10px;">
                        ${p.githubLink ? `<a href="${p.githubLink}" target="_blank" class="material-symbols-outlined" style="font-size: 18px; color: var(--clr-text-muted); text-decoration: none;">code</a>` : ''}
                        ${p.liveLink ? `<a href="${p.liveLink}" target="_blank" class="material-symbols-outlined" style="font-size: 18px; color: var(--clr-accent); text-decoration: none;">open_in_new</a>` : ''}
                    </div>
                </div>
            </article>
        `).join('');
    }

    // Filters
    if (statusFilters) {
        statusFilters.querySelectorAll('.filter-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                statusFilters.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeStatus = btn.dataset.status;
                render();
            });
        });
    }

    // New Project Handler (Delegates to projects.html for now or shows alert)
    if (newProjectBtn) {
        newProjectBtn.addEventListener('click', () => {
            IrisModal.confirm('Would you like to head to the main Projects chamber to upload a new technical venture?', 'New Venture')
                .then(ok => {
                    if (ok) window.location.href = 'projects.html';
                });
        });
    }

    // Init
    render();
    if (typeof SidebarEngine !== 'undefined') SidebarEngine.init();

})();
