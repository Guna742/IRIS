/**
 * I.R.I.S — Employee Dashboard Logic
 * Personalized workspace for corporate employees.
 * Updated to match the premium Intern Dashboard UI experience.
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
        const projects = Storage.getProjects() || [];
        const myProjects = projects.filter(p => (p.userId || p.ownerId) === session.userId);
        const reports = Storage.getHourlyReports ? Storage.getHourlyReports(session.userId) : [];

        // ── Welcome ──
        const firstName = (profile.name || 'Professional').split(' ')[0];
        if (welcomeTitle) {
            welcomeTitle.innerHTML = `
                <h1 class="dash-hero-title">Welcome back, ${firstName}</h1>
                <p class="dash-hero-subtitle">You have ${myProjects.length} active ventures and ${reports.length} logs recorded.</p>
            `;
        }

        renderStats(profile, myProjects, reports);
        renderActions();
        renderRecentReports(reports);
        renderRecentProjects(myProjects);
        renderInsights(profile, reports);
        renderMission(reports);
        renderJourney(profile, reports);
        renderSkills(profile);

        // Animate
        if (typeof animateCounters === 'function') animateCounters();
    }

    function renderStats(profile, myProjects, reports) {
        if (!statsGrid) return;
        
        const metrics = Storage.getProfileMetrics ? Storage.getProfileMetrics(profile) : { score: 100 };
        const streakDays = Storage.getInternStreak ? Storage.getInternStreak(session.userId) : (profile.streak || 0);
        
        const stats = [
            { label: 'System Efficiency', value: metrics.score, suffix: '%', icon: 'bolt', color: '#3b82f6', comic: 'Performance index' },
            { label: 'Active Ventures', value: myProjects.length, icon: 'folder_managed', color: '#8b5cf6', comic: 'Managed projects' },
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
                <div class="stat-comic-text" style="font-size:11px; margin-top:10px; opacity:0.8;">${s.comic}</div>
            </div>
        `).join('');
    }

    function renderActions() {
        if (!quickActions) return;
        const actions = [
            { label: 'Record Activity', desc: 'Submit your daily progress log', href: 'employee-report.html', icon: 'edit_note', color: 'rgba(59,130,246,0.1)' },
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
            recentReportsList.innerHTML = `<p class="text-muted text-sm" style="padding:20px; text-align:center;">No recent logs found.</p>`;
            return;
        }

        recentReportsList.innerHTML = recent.map(r => `
            <div class="report-item" style="padding:15px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center;">
                <div class="report-main">
                    <div style="font-weight:700; font-size:14px; color:var(--clr-text-main);">Log Slot ${r.window}:00</div>
                    <div style="font-size:12px; color:var(--clr-text-muted); margin-top:4px;">${r.description || r.note || 'Documented progress entry.'}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:10px; color:var(--clr-accent); font-weight:800; text-transform:uppercase;">${new Date(r.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                    <div style="font-size:9px; color:var(--clr-text-muted); opacity:0.6;">${new Date(r.createdAt).toLocaleDateString()}</div>
                </div>
            </div>
        `).join('');
    }

    function renderRecentProjects(projects) {
        if (!recentProjList) return;
        const recent = projects.slice(0, 4);
        
        if (recent.length === 0) {
            recentProjList.innerHTML = `<p class="text-muted text-sm" style="padding:40px; text-align:center;">No managed ventures yet.</p>`;
            return;
        }

        recentProjList.innerHTML = recent.map(p => `
            <div class="proj-card-mini reveal" onclick="window.location.href='employee-projects.html#${p.id}'" style="cursor:pointer; display:flex; align-items:center; gap:15px; padding:15px; border-radius:12px; background:rgba(255,255,255,0.02); margin-bottom:12px; border:1px solid rgba(255,255,255,0.05); transition:all 0.3s ease;">
                <div class="proj-card-icon" style="width:40px; height:40px; border-radius:10px; background:linear-gradient(135deg, var(--clr-accent), #8b5cf6); display:flex; align-items:center; justify-content:center; color:white; font-weight:800;">${p.title[0]}</div>
                <div style="flex:1">
                    <div class="proj-card-title" style="font-weight:700; font-size:14px;">${p.title}</div>
                    <div class="proj-card-stack" style="font-size:11px; color:var(--clr-text-muted); margin-top:2px;">${(p.techStack || []).slice(0, 2).join(' · ')}</div>
                </div>
                <span class="badge ${p.status === 'Completed' ? 'badge-success' : 'badge-warning'}" style="font-size:9px;">${p.status || 'Active'}</span>
            </div>
        `).join('');
    }

    function renderInsights(profile, reports) {
        const el = document.getElementById('insights-content');
        if (!el) return;

        const evalRes = reports.length > 0 && Storage.calculateReportScore 
            ? Storage.calculateReportScore(reports[0]) 
            : { score: 0, feedback: "No activity traces detected... standing by for technical data. 🚀" };

        el.innerHTML = `
            <div style="display:flex; align-items:center; gap:16px;">
                <div class="insights-icon-glow"><span class="material-symbols-outlined" style="color:var(--clr-accent)">psychology</span></div>
                <div style="flex:1">
                    <h4 style="font-size:13px; margin-bottom:4px; font-weight:700; color:var(--clr-text-main);">System Intelligence</h4>
                    <div class="insights-text" style="font-size:12px; line-height:1.4; color:var(--clr-text-muted);">
                        Current Performance Index: <b style="color:var(--clr-accent)">${evalRes.score}/100</b>. <br>
                        <span style="opacity:0.9">${evalRes.feedback}</span>
                        ${evalRes.score > 0 ? `<br><small style="color:var(--clr-success); font-weight:700;">Optimization target achieved! 🔥</small>` : ''}
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
            { label: 'Submit Daily Activity Log', done: hasLogToday, href: 'employee-report.html' },
            { label: 'Review Project Benchmarks', done: false, href: 'employee-projects.html' },
            { label: 'Update Corporate Portfolio', done: true, href: 'employee-profile.html' }
        ];

        el.innerHTML = tasks.map(t => `
            <div class="checklist-item" style="display:flex; align-items:center; gap:12px; margin-bottom:12px; padding:10px; background:rgba(255,255,255,0.02); border-radius:8px;">
                <div class="check-circle ${t.done ? 'checked' : ''}" style="width:20px; height:20px; border-radius:50%; border:2px solid ${t.done ? 'var(--clr-success)' : 'var(--clr-accent)'}; display:flex; align-items:center; justify-content:center; background:${t.done ? 'var(--clr-success)' : 'transparent'};">
                    ${t.done ? '<span class="material-symbols-outlined" style="font-size:12px; color:white;">check</span>' : ''}
                </div>
                <div class="checklist-text ${t.done ? 'completed' : ''}" style="flex:1; font-size:13px; ${t.done ? 'text-decoration:line-through; opacity:0.5;' : ''}">${t.label}</div>
                <a href="${t.href}" class="material-symbols-outlined" style="font-size:18px; color:var(--clr-accent); text-decoration:none;">arrow_forward</a>
            </div>
        `).join('');
    }

    function renderJourney(profile, reports) {
        const el = document.getElementById('journey-content');
        if (!el) return;

        const totalReports = reports.length;
        const score = Storage.getProfileMetrics ? Storage.getProfileMetrics(profile).score : 100;
        
        el.innerHTML = `
            <div class="journey-card" style="display:flex; flex-direction:column; gap:20px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                    <div>
                        <div style="font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--clr-text-muted); margin-bottom:4px;">Experience Level</div>
                        <div style="font-size:20px; font-weight:800; color:var(--clr-accent);">Corporate Lead</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--clr-text-muted); margin-bottom:4px;">Project Efficiency</div>
                        <div style="font-size:20px; font-weight:800; color:var(--clr-success);">${score}%</div>
                    </div>
                </div>
                
                <div class="journey-milestones" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px;">
                    <div style="background:rgba(255,255,255,0.03); padding:15px; border-radius:12px; text-align:center; border:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:18px; font-weight:800; color:var(--clr-text-main);">${totalReports}</div>
                        <div style="font-size:9px; text-transform:uppercase; color:var(--clr-text-muted); margin-top:4px;">Logs</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.03); padding:15px; border-radius:12px; text-align:center; border:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:18px; font-weight:800; color:var(--clr-text-main);">${profile.points || 0}</div>
                        <div style="font-size:9px; text-transform:uppercase; color:var(--clr-text-muted); margin-top:4px;">XP</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.03); padding:15px; border-radius:12px; text-align:center; border:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:18px; font-weight:800; color:var(--clr-text-main);">${Storage.getProjects().filter(p => (p.userId || p.ownerId) === session.userId && p.status === 'Completed').length}</div>
                        <div style="font-size:9px; text-transform:uppercase; color:var(--clr-text-muted); margin-top:4px;">Done</div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderSkills(profile) {
        const el = document.getElementById('skills-content');
        if (!el) return;

        const skills = profile.skills || ['Corporate Ops', 'Strategic Sync'];
        
        el.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:15px;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:40px; height:40px; border-radius:50%; background:var(--clr-accent); display:flex; align-items:center; justify-content:center; color:white; font-weight:800;">${(profile.name || 'E')[0]}</div>
                    <div>
                        <div style="font-weight:700; font-size:14px; color:var(--clr-text-main);">${profile.name || 'Employee'}</div>
                        <div style="font-size:11px; color:var(--clr-accent); font-weight:700;">${profile.internship?.role || 'Professional'}</div>
                    </div>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                    ${skills.map(s => `<span style="padding:4px 10px; background:rgba(59, 130, 246, 0.1); color:var(--clr-accent); border:1px solid rgba(59, 130, 246, 0.2); border-radius:20px; font-size:10px; font-weight:700;">${s}</span>`).join('')}
                </div>
            </div>
        `;
    }

    function animateCounters() {
        document.querySelectorAll('.counter-num').forEach(el => {
            const target = parseInt(el.dataset.target, 10) || 0;
            if (isNaN(target)) return;
            let current = 0;
            const duration = 1000;
            const steps = 30;
            const increment = target / steps;
            const interval = duration / steps;
            
            const timer = setInterval(() => {
                current += increment;
                if (current >= target) {
                    el.textContent = target;
                    clearInterval(timer);
                } else {
                    el.textContent = Math.floor(current);
                }
            }, interval);
        });
    }

    // Init
    render();
    if (typeof SidebarEngine !== 'undefined') SidebarEngine.init();

})();
