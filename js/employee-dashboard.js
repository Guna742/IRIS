/**
 * I.R.I.S — Employee Dashboard Logic
 * Personalized workspace for corporate employees.
 */

'use strict';

(() => {
    // ── Auth Guard ──
    const session = Auth.requireAuth(['employee']);
    if (!session) return;

    // ── Data Sync ──
    if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
        Storage.fetchEverything();
    }

    window.addEventListener('iris-data-sync', () => {
        render();
    });

    // ── DOM refs ──
    const statsGrid = document.getElementById('stats-grid');
    const quickActions = document.getElementById('quick-actions');
    const recentProjList = document.getElementById('recent-projects-list');
    const recentReportsList = document.getElementById('recent-reports-list');
    const welcomeTitle = document.getElementById('welcome-title');
    const welcomeSub = document.getElementById('welcome-sub');

    function render() {
        const profile = Storage.getProfile(session.userId) || {};
        const reports = Storage.getHourlyReports(session.userId) || [];

        // ── Welcome ──
        const firstName = (profile.name || 'Professional').split(' ')[0];
        if (welcomeTitle) welcomeTitle.innerHTML = `Welcome back, ${firstName} <span class="material-symbols-outlined" style="vertical-align:middle;color:var(--clr-accent)">verified</span>`;
        if (welcomeSub) welcomeSub.textContent = `You have ${reports.length} logs recorded.`;

        renderStats(profile, reports);
        renderActions();
        renderRecentReports(reports);
        renderInsights(profile, reports);
        renderMission(reports);

        // Animate
        if (typeof animateCounters === 'function') animateCounters();
    }

    function renderStats(profile, reports) {
        if (!statsGrid) return;
        
        const metrics = Storage.getProfileMetrics(profile);
        const streakDays = Storage.getInternStreak ? Storage.getInternStreak(session.userId) : 0;
        
        const stats = [
            { label: 'System Efficiency', value: metrics.score, suffix: '%', icon: 'bolt', color: '#3b82f6', comic: 'Performance index' },
            { label: 'Work Streak', value: streakDays, suffix: ' Days', icon: 'local_fire_department', color: '#f59e0b', comic: 'Consecutive activity' },
            { label: 'Total Logs', value: reports.length, icon: 'history', color: '#10b981', comic: 'Hourly submissions' }
        ];

        statsGrid.innerHTML = stats.map((s, i) => `
            <div class="stat-card reveal anim-d${i + 1} card-3d">
                <div class="glare"></div>
                <div class="stat-card-head">
                    <div class="stat-card-label">${s.label}</div>
                    <div class="stat-card-icon"><span class="material-symbols-outlined" style="color:${s.color}">${s.icon}</span></div>
                </div>
                <div class="stat-card-value">
                    <span class="counter-num" data-target="${s.value}">${s.value}</span>
                    <span class="stat-suffix">${s.suffix || ''}</span>
                </div>
                <div class="stat-comic-text">${s.comic}</div>
            </div>
        `).join('');
    }

    function renderActions() {
        if (!quickActions) return;
        const actions = [
            { label: 'Record Activity', desc: 'Submit your daily progress log', href: 'report-submission.html', icon: 'edit_note', color: 'rgba(59,130,246,0.1)' },
            { label: 'Performance View', desc: 'Detailed efficiency analytics', href: `employee-analytics.html?student=${session.userId}`, icon: 'analytics', color: 'rgba(139,92,246,0.1)' },
            { label: 'Team Directory', desc: 'Connect with your colleagues', href: 'employees.html', icon: 'badge', color: 'rgba(16,185,129,0.1)' },
        ];

        quickActions.innerHTML = actions.map((a, i) => `
            <a class="action-tile anim-stagger visible" style="transition-delay:${i * 0.1}s" href="${a.href}">
                <div class="action-icon" style="background:${a.color}"><span class="material-symbols-outlined">${a.icon}</span></div>
                <div class="action-content">
                    <div class="action-label">${a.label}</div>
                    <div class="action-desc">${a.desc}</div>
                </div>
                <span class="material-symbols-outlined arrow-icon">arrow_forward</span>
            </a>
        `).join('');
    }

    function renderRecentReports(reports) {
        if (!recentReportsList) return;
        const recent = reports.sort((a,b) => b.createdAt - a.createdAt).slice(0, 5);
        
        if (recent.length === 0) {
            recentReportsList.innerHTML = `<p class="text-muted text-sm">No recent logs found.</p>`;
            return;
        }

        recentReportsList.innerHTML = recent.map(r => `
            <div class="proj-item visible card-3d" style="padding:12px; margin-bottom:8px;">
                <div class="proj-info">
                    <div style="font-weight:600; font-size:14px;">Log Slot ${r.window}:00</div>
                    <div style="font-size:12px; opacity:0.7;">${r.description || r.note || 'No description provided.'}</div>
                </div>
                <div style="font-size:10px; opacity:0.6;">${new Date(r.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
            </div>
        `).join('');
    }


    function renderInsights(profile, reports) {
        const el = document.getElementById('insights-content');
        if (!el) return;

        const evalRes = reports.length > 0 
            ? Storage.calculateReportScore(reports[0]) 
            : { score: 100, feedback: "Ready for your first logs." };

        el.innerHTML = `
            <div style="display:flex; align-items:center; gap:16px;">
                <div class="insights-icon-glow"><span class="material-symbols-outlined" style="color:var(--clr-accent)">corporate_fare</span></div>
                <div style="flex:1">
                    <h4 style="font-size:13px; margin-bottom:4px;">Efficiency Intelligence</h4>
                    <div class="insights-text" style="font-size:12px; line-height:1.4">
                        Current Output Quality: <b>${evalRes.score}/100</b>. <br>
                        <span style="opacity:0.8">${evalRes.feedback}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function renderMission(reports) {
        const el = document.getElementById('checklist-content');
        if (!el) return;

        const today = new Date().toDateString();
        const hasLogToday = reports.some(r => new Date(r.createdAt).toDateString() === today);

        const tasks = [
            { label: 'Submit Daily Activity Log', done: hasLogToday, href: 'report-submission.html' },
            { label: 'Update Corporate Profile', done: true, href: 'employee-profile.html' }
        ];

        el.innerHTML = tasks.map(t => `
            <div class="checklist-item">
                <div class="check-circle ${t.done ? 'checked' : ''}">
                    ${t.done ? '<span class="material-symbols-outlined" style="font-size:12px">check</span>' : ''}
                </div>
                <div class="checklist-text ${t.done ? 'completed' : ''}">${t.label}</div>
                <a href="${t.href}" class="material-symbols-outlined" style="font-size:18px; color:var(--clr-accent); text-decoration:none;">arrow_forward</a>
            </div>
        `).join('');
    }

    function animateCounters() {
        document.querySelectorAll('.counter-num').forEach(el => {
            const target = parseInt(el.dataset.target, 10) || 0;
            let current = 0;
            const step = Math.ceil(target / 30);
            const timer = setInterval(() => {
                current += step;
                if (current >= target) {
                    el.textContent = target;
                    clearInterval(timer);
                } else {
                    el.textContent = current;
                }
            }, 30);
        });
    }

    // Init
    render();
    if (typeof SidebarEngine !== 'undefined') SidebarEngine.init();

})();
