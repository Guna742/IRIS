/**
 * InternTrack — Intern Analytics Dashboard
 * Renders Apexify-style analytics for an individual intern.
 * Entry URL: student-analytics.html?student=<userId>
 */

'use strict';

(async () => {
    // ── Auth Guard (admin or intern) ──
    const session = Auth.requireAuth(['admin', 'user']);
    if (!session) return;

    if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
        await Storage.fetchEverything();
    }

    const isAdmin = session.role === 'admin';

    SidebarEngine.init(session);
    document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());

    if (Storage?.markMissionVisited) {
        Storage.markMissionVisited('performance', session.userId);
    }

    // ── Get target intern ──
    const params = new URLSearchParams(location.search);
    let targetUid = params.get('student');

    // If intern, they can ONLY see their own data
    if (!isAdmin) {
        targetUid = session.userId;
    }

    const loadingEl = document.getElementById('analytics-loading');
    const outputEl = document.getElementById('analytics-output');

    if (!targetUid) {
        showError('No intern specified. Return to Intern Directory and click "Analytics".');
        return;
    }

    const profile = Storage.getProfile(targetUid);
    if (!profile) {
        showError('Intern profile could not be loaded. Please ensure you are logged in.');
        return;
    }

    // Force fetch of target user reports (especially for Admins viewing interns)
    if (typeof Storage !== 'undefined' && Storage.fetchUserReports) {
        Storage.fetchUserReports(targetUid);
    }


    const allProjects = Storage.getProjects();
    const myProjects = allProjects.filter(p => String(p.userId || p.ownerId) === String(targetUid));

    // Sidebar and role badges handled by SidebarEngine.init()
    const topbarTitle = document.getElementById('topbar-title');
    if (topbarTitle) {
        topbarTitle.textContent = isAdmin ? `${profile.name || 'Intern'}'s Analytics` : 'My Analytics';
    }
    // ── Compute analytics values ──
    const skillCount = (profile.skills || []).length;
    const projectCount = myProjects.length;
    const completionPct = computeCompletion(profile);
    const overallScore = computeScore(profile, myProjects);
    const intern = profile.internship || {};
    const isActive = intern.endDate ? new Date(intern.endDate) >= new Date() : !!intern.company;

    // ── Render everything ──
    try {
        if (loadingEl) loadingEl.remove();
        outputEl.hidden = false;
        outputEl.innerHTML = buildDashHTML(profile, myProjects || []);

            // Post-render: animate stats + charts
            const runRefresh = () => {
                try { animateCounters(); } catch (e) { console.warn('Counter animation failed', e); }
                try {
                    refreshCharts();
                } catch (e) { console.warn('Charts failed', e); }
                try { renderBarChart(profile?.skills || []); } catch (e) { console.warn('Bar chart failed', e); }
                
                // Critical: Always reveal content and setup handlers after a refresh
                try { initReveal(); } catch (e) {}
                try { setupDetailHandlers(); } catch (e) {}
            };


            // Phase 1: Immediate-ish
            setTimeout(() => {
                runRefresh();
            }, 300);


            // Phase 2: Secondary pulse to catch async data updates
            setTimeout(runRefresh, 2000);
    } catch (err) {
        console.error('Analytics render failed', err);
        showError('Encountered an error while rendering your dashboard. Please check your profile data.');
    }

    // ────────────────────────────────────────────────────────
    // HTML BUILDER
    // ────────────────────────────────────────────────────────
    function buildDashHTML(p, projects) {
        const intern = p.internship || {};
        const links = p.socialLinks || {};

        // Status for projects (mock realistic statuses)
        const statusPool = ['success', 'success', 'processing', 'pending', 'declined'];

        const internObj2 = p.internship || {};
        const periodStr = internObj2.startDate
            ? `${fmtDate(internObj2.startDate)} — ${internObj2.endDate ? fmtDate(internObj2.endDate) : 'Present'}`
            : 'Internship Period';

        return `
        <!-- ═══ INTERN PROFILE BANNER ═══ -->
        <div class="role-banner ${isAdmin ? 'admin' : 'user'} reveal anim-d1" style="margin-bottom:var(--sp-8)">
            <span class="role-banner-icon" aria-hidden="true">${p.avatar ? `<img src="${p.avatar}" alt="${p.name}" style="width:40px;height:40px;border-radius:50%;object-fit:cover">` : '<span class="material-symbols-outlined">analytics</span>'}</span>
            <div class="role-banner-text">
                <div class="role-banner-title">${p.name || 'Intern'}</div>
                <div class="role-banner-sub">${internObj2.role || 'Intern'} ${internObj2.company ? '· ' + internObj2.company : ''} · ${periodStr}</div>
            </div>
            <span class="badge ${isAdmin ? 'badge-admin' : 'badge-user'}">${isAdmin ? 'Admin View' : 'My Stats'}</span>
        </div>

        <!-- ═══ HOURLY REPORT WIDGET ═══ -->
        ${(() => {
            const reports = Storage.getHourlyReports(p.userId);
            const todayStr = new Date().toDateString();
            const todayReports = reports.filter(r => new Date(r.createdAt || r.timestamp).toDateString() === todayStr);
            
            const w1 = todayReports.find(r => r.window === 1);
            const w2 = todayReports.find(r => r.window === 2);
            
            const getStatusCard = (winId, report, label) => {
                const endHour = winId === 1 ? 13 : 18;
                let statusColor = '#94a3b8'; // default grey
                let statusText = 'Pending';
                let subTimeStr = '--:--';
                let isLate = false;
                let showDot = true;

                if (report) {
                    const subTime = new Date(report.createdAt || report.timestamp);
                    isLate = subTime.getHours() >= endHour;
                    subTimeStr = subTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    statusColor = isLate ? '#f59e0b' : '#10b981';
                    statusText = isLate ? 'Late Submission' : 'On Time';
                } else {
                    const currentHour = new Date().getHours();
                    if (currentHour >= endHour) {
                        statusColor = '#ef4444';
                        statusText = 'Not Submitted';
                    } else {
                        statusText = 'Awaiting...';
                        showDot = false;
                    }
                }

                return `
                    <div class="report-status-item" style="padding: 15px; background: rgba(255,255,255,0.02); border: 1px solid var(--clr-border); border-radius: 12px; flex: 1">
                        <div style="font-size: 0.8rem; color: var(--clr-text-muted); margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${label}</div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            ${showDot ? `<div style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; box-shadow: 0 0 10px ${statusColor}"></div>` : ''}
                            <div style="font-weight: 700; color: ${statusColor === '#94a3b8' ? 'var(--clr-text-main)' : statusColor}">${statusText}</div>
                        </div>
                        <div style="font-size: 0.75rem; color: var(--clr-text-muted); margin-top: 4px;">${report ? `Received at ${subTimeStr}` : (statusText === 'Not Submitted' ? `Deadline missed (${endHour}:00)` : `Window open until ${endHour}:00`)}</div>
                    </div>
                `;
            };

            return `
            <div class="reports-overview reveal anim-d1" style="margin-bottom: var(--sp-6);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <h3 style="font-size: 1rem; margin: 0; display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined" style="font-size: 20px; color: var(--clr-primary)">history_edu</span>
                        Daily Reporting Activity
                    </h3>
                    <span style="font-size: 0.8rem; color: var(--clr-text-muted);">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                </div>
                <div style="display: flex; gap: 15px;">
                    ${getStatusCard(1, w1, 'Morning window (09:00 - 13:00)')}
                    ${getStatusCard(2, w2, 'Afternoon window (14:00 - 18:00)')}
                </div>
            </div>
            `;
        })()}

        <!-- ═══ STATS ROW ═══ -->
        <div class="stats-row">

            <div class="stat-card reveal anim-d1">
                <div class="stat-card-head">
                    <div class="stat-card-label">Overall Score</div>
                    <div class="stat-card-icon" style="background:rgba(139,92,246,.12)" aria-hidden="true">
                        <span class="material-symbols-outlined" style="color:var(--clr-violet)">stars</span>
                    </div>
                </div>
                <div class="stat-card-value counter-num" data-target="${overallScore}" data-suffix="%">0%</div>
                <div class="stat-card-trend ${overallScore >= 70 ? 'up' : overallScore >= 50 ? 'neutral' : 'down'}">
                    ${overallScore >= 70 ? arrowUp() : overallScore >= 50 ? '—' : arrowDown()}
                    <span>${overallScore >= 70 ? '+' : ''}${overallScore - 50}%</span>
                    <span class="trend-label">vs base target</span>
                </div>
                ${sparklineSVG()}
            </div>

            <div class="stat-card reveal anim-d2">
                <div class="stat-card-head">
                    <div class="stat-card-label">Skills Listed</div>
                    <div class="stat-card-icon" style="background:rgba(34,211,238,.12)" aria-hidden="true">
                        <span class="material-symbols-outlined" style="color:var(--clr-cyan)">bolt</span>
                    </div>
                </div>
                <div class="stat-card-value counter-num" data-target="${skillCount}">0</div>
                <div class="stat-card-trend ${skillCount > 0 ? 'up' : 'neutral'}">
                    ${skillCount > 0 ? arrowUp() : '—'}
                    <span>${skillCount} skill${skillCount !== 1 ? 's' : ''} recorded</span>
                </div>
                ${sparklineSVG('#22d3ee')}
            </div>

            <div class="stat-card reveal anim-d3">
                <div class="stat-card-head">
                    <div class="stat-card-label">Projects Submitted</div>
                    <div class="stat-card-icon" style="background:rgba(16,185,129,.1)" aria-hidden="true">
                        <span class="material-symbols-outlined" style="color:var(--clr-success)">folder</span>
                    </div>
                </div>
                <div class="stat-card-value counter-num" data-target="${projectCount}">0</div>
                <div class="stat-card-trend ${projectCount > 0 ? 'up' : 'neutral'}">
                    ${projectCount > 0 ? arrowUp() : '—'}
                    <span>${projectCount > 0 ? 'Active submissions' : 'No projects yet'}</span>
                </div>
                ${sparklineSVG('#10b981')}
            </div>

            <div class="stat-card reveal anim-d4">
                <div class="stat-card-head">
                    <div class="stat-card-label">Profile Completion</div>
                    <div class="stat-card-icon" style="background:rgba(245,158,11,.1)" aria-hidden="true">
                        <span class="material-symbols-outlined" style="color:var(--clr-warning)">checklist</span>
                    </div>
                </div>
                <div class="stat-card-value counter-num" data-target="${completionPct}" data-suffix="%">0%</div>
                <div class="stat-card-trend ${completionPct >= 80 ? 'up' : completionPct >= 50 ? 'neutral' : 'down'}">
                    ${completionPct >= 60 ? arrowUp() : arrowDown()}
                    <span>${completionPct}% complete</span>
                </div>
                ${sparklineSVG('#f59e0b')}
            </div>

            <div class="stat-card reveal anim-d5">
                <div class="stat-card-head">
                    <div class="stat-card-label">Reporting Reliability</div>
                    <div class="stat-card-icon" style="background:rgba(16,185,129,.1)" aria-hidden="true">
                        <span class="material-symbols-outlined" style="color:var(--clr-success)">history</span>
                    </div>
                </div>
                <div class="stat-card-value counter-num" data-target="${(() => {
                    const reports = Storage.getHourlyReports(p.userId);
                    const now = new Date();
                    // Basic heuristic: 2 reports per weekday since start date
                    const start = new Date(p.internship?.startDate || Date.now() - 7*24*60*60*1000);
                    const daysDiff = Math.max(1, Math.ceil((now - start) / (1000 * 60 * 60 * 24)));
                    const expected = daysDiff * 2;
                    return Math.min(100, Math.round((reports.length / expected) * 100));
                })()}" data-suffix="%">0%</div>
                <div class="stat-card-trend neutral">
                    <span>Consistency Score</span>
                </div>
                ${sparklineSVG('#10b981')}
            </div>

        </div>

        <!-- ═══ CHARTS ROW ═══ -->
        <div class="charts-row" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: var(--sp-6);">

            <!-- Chart 1: Analytic Overview -->
            <div class="chart-widget reveal anim-d1">
                <div class="chart-widget-head">
                    <div>
                        <div class="chart-widget-title" id="chart-1-title">Analytic Overview</div>
                        <div class="chart-widget-meta" id="chart-1-meta">Long-term performance & project growth</div>
                    </div>
                </div>
                <div class="chart-sub-head" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <div class="chart-controls">
                        <button class="chart-tab active" onclick="updateTimeFilter('today', this)">Today</button>
                        <button class="chart-tab" onclick="updateTimeFilter('week', this)">Week</button>
                        <button class="chart-tab" onclick="updateTimeFilter('month', this)">Month</button>
                    </div>
                </div>
                <div class="line-chart-wrap" id="line-chart-wrap-1" aria-label="Performance line chart">
                    <!-- SVG injected by JS -->
                </div>
                <div class="chart-legend">
                    <div class="legend-item">
                        <div class="legend-dot" style="background:#8b5cf6"></div>
                        <span>Score</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-dot" style="background:#22d3ee"></div>
                        <span>Target</span>
                    </div>
                </div>
            </div>

            <!-- Chart 2: Reporting Performance (ADMIN ONLY) -->
            ${isAdmin ? `
            <div class="chart-widget reveal anim-d2">
                <div class="chart-widget-head">
                    <div>
                        <div class="chart-widget-title">Reporting Performance</div>
                        <div class="chart-widget-meta">Consistency based on 4-hour window updates</div>
                    </div>
                </div>
                <div class="chart-sub-head" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <div class="chart-controls">
                        <button class="chart-tab active" onclick="updateReportFilter('today', this)">Today</button>
                        <button class="chart-tab" onclick="updateReportFilter('week', this)">Week</button>
                        <button class="chart-tab" onclick="updateReportFilter('month', this)">Month</button>
                    </div>
                </div>
                <div class="line-chart-wrap" id="report-performance-chart-wrap" style="height:240px;">
                    <!-- SVG injected by JS -->
                </div>
                <div class="chart-legend">
                    <div class="legend-item">
                        <div class="legend-dot" style="background:#10b981"></div>
                        <span>Submission %</span>
                    </div>
                </div>
            </div>` : ''}

        </div>

        <!-- ═══ SKILL DISTRIBUTION ROW ═══ -->
        <div class="charts-row" style="grid-template-columns: 1fr;">
            <div class="chart-widget reveal anim-d2" style="min-height: auto;">
                <div class="chart-widget-head">
                    <div>
                        <div class="chart-widget-title">Skill Distribution</div>
                        <div class="chart-widget-meta">Top technical competencies</div>
                    </div>
                </div>
                <div class="bar-chart-wrap" id="bar-chart-wrap" aria-label="Skill bar chart">
                    <!-- Bars injected by JS -->
                </div>
            </div>
        </div>

        <!-- ═══ HISTORICAL TRACK TABLE (PROJECTS) ═══ -->
        <div class="history-section reveal anim-d2">
            <div class="history-head">
                <div class="history-title">Performance Log (Projects)</div>
                <div class="history-actions">
                    ${isAdmin ? `<a href="students.html" class="btn btn-secondary btn-sm"><span class="material-symbols-outlined" style="font-size: 16px;">arrow_back</span> Back to Interns</a>` : `
                    <a href="projects.html" class="btn btn-primary btn-sm"><span class="material-symbols-outlined" style="font-size: 16px;">edit</span> Edit Project</a>`}
                </div>
            </div>
            ${projects.length === 0 ? `
            <div class="empty-state">
                <div class="empty-state-icon material-symbols-outlined">folder</div>
                <div class="empty-state-title">No projects yet</div>
                <div class="empty-state-desc">This intern hasn't submitted any projects yet.</div>
            </div>` : `
            <table class="history-table" aria-label="Project history">
                <thead>
                    <tr>
                        <th>Project</th>
                        <th>Performance</th>
                        <th>Submitted</th>
                        <th>Status</th>
                        <th>Role</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${projects.map((proj, i) => {
            const status = statusPool[i % statusPool.length];
            const initials = (profile.name || 'I')[0].toUpperCase();
            return `
                    <tr class="reveal">
                        <td data-label="Project">
                            <div class="proj-info">
                                <div class="proj-name">${proj.title}</div>
                                <div class="proj-stack">
                                    ${(proj.techStack || []).slice(0, 3).map(s => `<span>${s}</span>`).join('')}
                                </div>
                            </div>
                        </td>
                        <td data-label="Performance">
                            <div class="progress-mini">
                                <div class="progress-mini-bar" style="width:${proj.rating ? (proj.rating / 5) * 100 : 0}%; background:var(--clr-violet)"></div>
                            </div>
                        </td>
                        <td data-label="Submitted">
                             <div class="history-date">${proj.createdAt ? new Date(proj.createdAt).toLocaleDateString() : 'N/A'}</div>
                        </td>
                        <td data-label="Status">
                            <span class="badge badge-${status}">${status.toUpperCase()}</span>
                        </td>
                        <td data-label="Role">
                            <div class="table-user">
                                <span class="material-symbols-outlined" style="font-size: 18px; color: var(--clr-primary); margin-right: 8px;">badge</span>
                                <span>${profile.internship?.role || 'Technical'} Intern</span>
                            </div>
                        </td>
                        <td>${proj.liveLink ? `<a href="${proj.liveLink}" target="_blank" rel="noopener" class="more-btn">Live ↗</a>` : `<button class="more-btn detail-trigger" data-id="${proj.id}">Details ▾</button>`}</td>
                    </tr>
                    <tr class="expandable-details-row" id="details-${proj.id}" style="display:none;">
                        <td colspan="6">
                            <div class="expand-content" style="padding: 20px; background: rgba(255,255,255,0.02); border-radius: 8px; margin: 10px; border: 1px solid var(--glass-border);">
                                <h4 style="color:var(--clr-primary); margin-bottom: 8px; font-size: 0.9rem;">Project Description</h4>
                                <p style="font-size: 0.85rem; color: var(--clr-text-main); line-height: 1.6; margin-bottom: 15px;">${proj.description || 'No detailed description available for this project yet.'}</p>
                                <div style="display:flex; gap:15px; font-size: 0.75rem; color: var(--clr-text-muted);">
                                    <span><strong>Project ID:</strong> ${proj.id.substring(0, 8)}...</span>
                                    <span><strong>Category:</strong> ${proj.category || 'Development'}</span>
                                    ${proj.updatedAt ? `<span><strong>Last Updated:</strong> ${new Date(proj.updatedAt).toLocaleDateString()}</span>` : ''}
                                </div>
                            </div>
                        </td>
                    </tr>`;
        }).join('')}
                </tbody>
            </table>`}
        </div>

        <!-- ═══ REPORTING HISTORY TABLE (REPORTS) ═══ -->
        <div class="history-section reveal anim-d3" style="margin-top: var(--sp-6)">
            <div class="history-head">
                <div class="history-title">Technical Reporting Log</div>
                <div class="history-actions">
                    <span style="font-size: 0.8rem; color: var(--clr-text-muted);">Historical tracking of daily updates</span>
                </div>
            </div>
            ${(() => {
            const reports = Storage.getHourlyReports(p.userId).sort((a, b) => (b.createdAt || b.timestamp) - (a.createdAt || a.timestamp));
            if (reports.length === 0) {
                return `
                    <div class="empty-state">
                        <div class="empty-state-icon material-symbols-outlined">description</div>
                        <div class="empty-state-title">No reports found</div>
                        <div class="empty-state-desc">This intern has not submitted any technical reports yet.</div>
                    </div>`;
            }
            return `
                <table class="history-table" style="margin-top: 10px;">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Window</th>
                            <th>Time</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reports.map(r => {
                const date = new Date(r.createdAt || r.timestamp);
                const endHour = r.window === 1 ? 13 : 18;
                const isLate = date.getHours() >= endHour;
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                return `
                            <tr>
                                <td data-label="Date">${dateStr}</td>
                                <td data-label="Window">${r.window === 1 ? 'Morning (W1)' : 'Afternoon (W2)'}</td>
                                <td data-label="Time">${timeStr}</td>
                                <td data-label="Status">
                                    <span class="badge ${isLate ? 'badge-warning' : 'badge-success'}" style="font-size: 10px; padding: 2px 8px;">
                                        ${isLate ? 'LATE SUBMISSION' : 'ON TIME'}
                                    </span>
                                </td>
                                <td>
                                    <button class="more-btn" onclick="viewDetailedReport('${r.id}')">View Details</button>
                                </td>
                            </tr>`;
            }).join('')}
                    </tbody>
                </table>`;
        })()}
        </div>

        <!-- ═══ WEEKLY CONSISTENCY TRACKER (7 DAYS) ═══ -->
        <div class="history-section reveal anim-d3" style="margin-top: var(--sp-6)">
            <div class="history-head">
                <div class="history-title">Weekly Consistency Tracker</div>
                <div style="display:flex; gap:12px; font-size:10px;">
                    <div style="display:flex; align-items:center; gap:4px;"><div style="width:8px; height:8px; background:#10b981; border-radius:2px;"></div> On Time</div>
                    <div style="display:flex; align-items:center; gap:4px;"><div style="width:8px; height:8px; background:#f59e0b; border-radius:2px;"></div> Late</div>
                    <div style="display:flex; align-items:center; gap:4px;"><div style="width:8px; height:8px; background:#ef4444; border-radius:2px;"></div> Missed</div>
                    <div style="display:flex; align-items:center; gap:4px;"><div style="width:8px; height:8px; background:rgba(255,255,255,0.05); border:1px dashed rgba(255,255,255,0.1); border-radius:2px;"></div> Holiday</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; margin-top: 15px; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid var(--glass-border);">
                ${(() => {
                    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                    return days.map(d => `<div style="text-align:center; font-size:10px; font-weight:700; color:var(--clr-text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:5px;">${d}</div>`).join('');
                })()}
                
                ${(() => {
                    const reports = Storage.getHourlyReports(p.userId);
                    const now = new Date();
                    
                    // Logic to find this week's Monday
                    const currentDay = now.getDay(); // 0 is Sunday, 1 is Monday
                    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
                    const monday = new Date(now);
                    monday.setDate(now.getDate() + diffToMonday);
                    monday.setHours(0,0,0,0);

                    let gridHTML = "";
                    for (let i = 0; i < 7; i++) {
                        const d = new Date(monday);
                        d.setDate(monday.getDate() + i);
                        const isSunday = d.getDay() === 0;
                        const ds = d.toDateString();
                        const isFuture = d > now;

                        const dayReports = reports.filter(r => new Date(r.createdAt || r.timestamp).toDateString() === ds);
                        const w1 = dayReports.find(r => r.window === 1);
                        const w2 = dayReports.find(r => r.window === 2);
                        
                        const getDot = (rep, winId) => {
                            if (isSunday) return 'transparent'; // Sunday is blank/holiday
                            if (isFuture) return 'rgba(255,255,255,0.03)';
                            
                            const deadline = winId === 1 ? 13 : 18;
                            if (!rep) {
                                // If day is in past and window closed
                                const dClose = new Date(d); dClose.setHours(deadline, 0, 0);
                                return (now > dClose) ? '#ef4444' : 'rgba(255,255,255,0.05)';
                            }
                            const subT = new Date(rep.createdAt || rep.timestamp);
                            return subT.getHours() >= deadline ? '#f59e0b' : '#10b981';
                        };

                        const dateTitle = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        const sundayStyle = isSunday ? 'border: 1px dashed rgba(255,255,255,0.1); background: rgba(255,255,255,0.02) !important;' : '';

                        gridHTML += `
                            <div class="day-slot-group" style="display:flex; flex-direction:column; gap:4px; padding:8px; background:rgba(255,255,255,0.03); border-radius:8px; ${sundayStyle}">
                                <div class="slot-dot" title="${dateTitle} Morning" style="height:10px; background:${getDot(w1, 1)}; border-radius:2px; transition: all 0.3s ease;"></div>
                                <div class="slot-dot" title="${dateTitle} Afternoon" style="height:10px; background:${getDot(w2, 2)}; border-radius:2px; transition: all 0.3s ease;"></div>
                                <div style="font-size:8px; color:var(--clr-text-muted); text-align:center; margin-top:2px; font-weight:600;">${d.getDate()}</div>
                            </div>
                        `;
                    }
                    return gridHTML;
                })()}
            </div>
            <div style="font-size: 0.7rem; color: var(--clr-text-muted); text-align: right; margin-top: 8px; font-style: italic;">Weekly cycle tracking: Morning & Afternoon reporting windows</div>
        </div>`;
    }

    // ── Global helper for technical reports ──
    window.viewDetailedReport = async (reportId) => {
        if (typeof Storage === 'undefined' || !Storage.getHourlyReportById) {
            console.error('Storage module incomplete');
            return;
        }

        const report = Storage.getHourlyReportById(reportId);
        if (!report) {
            await IrisModal.alert("Oops! Report details could not be found.");
            return;
        }

        const d = report.data;
        // If it's the old style report without structured data
        if (!d) {
            await IrisModal.alert(`
                <div style="text-align:left">
                    <h3 style="color:var(--clr-primary)">Daily Update</h3>
                    <p style="white-space:pre-wrap">${report.note || 'No content'}</p>
                </div>
            `);
            return;
        }

        const isPlaceholder = (val) => {
            if (!val) return true;
            const s = String(val).toLowerCase().trim();
            return s === 'nil' || s === '0' || s === 'none' || s === 'null';
        };

        const tasks = d.tasksCompleted || [];
        const hasTasks = tasks.some(t => !isPlaceholder(t.desc));

        const content = `
            <div style="text-align:left; max-width:600px; max-height: 70vh; overflow-y: auto; padding-right: 15px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px; border-bottom: 2px solid var(--clr-primary); padding-bottom:12px;">
                    <h2 style="color: var(--clr-primary); margin:0; font-size:1.4rem;">Technical Daily Report</h2>
                    ${report.resubmittedAt ? `
                        <div style="text-align:right; border:1px solid var(--clr-accent); padding:4px 8px; border-radius:6px; background:rgba(139,92,246,0.1);">
                            <div style="font-size:8px; text-transform:uppercase; color:var(--clr-accent); font-weight:800;">Resubmitted</div>
                            <div style="font-size:10px; color:var(--clr-text-main); font-weight:600;">${new Date(report.resubmittedAt).toLocaleDateString()}</div>
                        </div>
                    ` : ''}
                </div>

                <div style="display:flex; gap:15px; margin-bottom: 20px; font-size: 0.85rem; opacity: 0.9; background: rgba(255,255,255,0.03); padding: 10px; border-radius:8px;">
                    <span><strong style="color:var(--clr-primary)">Date:</strong> ${new Date(report.createdAt || report.timestamp).toLocaleDateString()}</span>
                    <span><strong style="color:var(--clr-primary)">Login:</strong> ${d.loginTime || 'N/A'}</span>
                    <span><strong style="color:var(--clr-primary)">Logout:</strong> ${d.logoutTime || 'N/A'}</span>
                </div>
                
                <div style="margin-bottom:20px;">
                    <h4 style="color:var(--clr-cyan); margin-bottom: 8px; text-transform:uppercase; font-size:11px; letter-spacing:1px; display:flex; align-items:center; gap:8px;">
                        <span class="material-symbols-outlined" style="font-size:16px;">assignment</span> Tasks Assigned:
                    </h4>
                    <div style="font-size: 0.95rem; color: var(--clr-text-main); padding-left:24px;">${d.tasksAssigned || 'No tasks specified'}</div>
                </div>

                ${hasTasks ? `
                <h4 style="color:var(--clr-cyan); margin-bottom: 8px; text-transform:uppercase; font-size:11px; letter-spacing:1px; display:flex; align-items:center; gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:16px;">task_alt</span> Tasks Completed:
                </h4>
                <div style="display:flex; flex-direction:column; gap:12px; margin-bottom: 20px;">
                    ${tasks.map((tc, idx) => !isPlaceholder(tc.desc) ? `
                        <div style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                            <div style="font-weight: 700; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px; margin-bottom: 8px; color:var(--clr-primary); font-size:0.9rem;">
                                ${idx+1}. ${tc.name || 'Project Module'}
                            </div>
                            <div style="font-size: 0.9rem; line-height: 1.6; color: var(--clr-text-main);">${tc.desc.replace(/\n/g, '<br>')}</div>
                        </div>
                    ` : '').join('')}
                </div>` : ''}

                ${!isPlaceholder(d.extraWork) ? `
                <div style="margin-bottom:20px;">
                    <h4 style="color:var(--clr-cyan); margin-bottom: 5px; text-transform:uppercase; font-size:11px; letter-spacing:1px;">Additional Work:</h4>
                    <div style="font-size: 0.9rem; color: var(--clr-text-main); background: rgba(139, 92, 246, 0.05); padding: 12px; border-radius: 8px;">
                        ${d.extraWork.replace(/\n/g, '<br>')}
                    </div>
                </div>` : ''}

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                    ${!isPlaceholder(d.workInProgress) ? `
                    <div style="background: rgba(245, 158, 11, 0.03); padding: 12px; border-radius: 8px; border: 1px solid rgba(245, 158, 11, 0.05);">
                        <h4 style="color:var(--clr-warning); margin-bottom: 8px; text-transform:uppercase; font-size:10px; letter-spacing:1px;">Work in Progress</h4>
                        <div style="font-size: 0.85rem; color: var(--clr-text-main); line-height: 1.5;">${d.workInProgress.replace(/\n/g, '<br>')}</div>
                    </div>` : ''}
                    
                    ${!isPlaceholder(d.pendingTasks) ? `
                    <div style="background: rgba(239, 68, 68, 0.03); padding: 12px; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.05);">
                        <h4 style="color:var(--clr-danger); margin-bottom: 8px; text-transform:uppercase; font-size:10px; letter-spacing:1px;">Pending Items</h4>
                        <div style="font-size: 0.85rem; color: var(--clr-text-main); line-height: 1.5;">${d.pendingTasks.replace(/\n/g, '<br>')}</div>
                    </div>` : ''}
                </div>

                <div style="margin-bottom:25px; background: rgba(16, 185, 129, 0.03); padding: 12px; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.05);">
                    <h4 style="color:var(--clr-success); margin-bottom: 8px; text-transform:uppercase; font-size:10px; letter-spacing:1px;">Today's Learning</h4>
                    <div style="font-size: 0.9rem; color: var(--clr-text-main); line-height: 1.5;">${d.whatLearned ? d.whatLearned.replace(/\n/g, '<br>') : 'N/A'}</div>
                </div>

                <div style="border-top: 1px solid var(--glass-border); padding-top: 20px; display:flex; justify-content:space-between; align-items:flex-end;">
                    <div style="font-size:0.75rem; color:var(--clr-text-muted);">
                        Submitted via I.R.I.S Secure Portal
                    </div>
                    <div style="text-align: right;">
                        <div style="color:var(--clr-text-muted); font-size: 11px; margin-bottom: 4px;">Respectfully,</div>
                        <div style="font-family: 'Dancing Script', cursive, serif; font-size: 1.3rem; color: var(--clr-primary); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;">${d.signature || 'Intern'}</div>
                    </div>
                </div>
            </div>
        `;

        await IrisModal.alert(content);
    };

    // ────────────────────────────────────────────────────────
    // CHART: SVG LINE CHART
    // ────────────────────────────────────────────────────────
    function renderLineChart(projects) {
        const wrap = document.getElementById('line-chart-wrap');
        if (!wrap) return;

        const W = wrap.clientWidth || 600;
        const H = 200;
        const pad = { top: 16, right: 20, bottom: 8, left: 36 };
        const cW = W - pad.left - pad.right;
        const cH = H - pad.top - pad.bottom;

        const points = getTrendData('growth', projects, profile.skills || []);
        const targetPoints = points.map((_, i) => 65 + i * 1.5);
        const labels = getLast8Months();

        const xScale = (i) => pad.left + (i / (points.length - 1)) * cW;
        const yScale = (v) => pad.top + cH - (v / 100) * cH;

        const toPath = (arr) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`).join(' ');
        const toArea = (arr) => `${toPath(arr)} L ${xScale(arr.length - 1).toFixed(1)} ${(pad.top + cH).toFixed(1)} L ${xScale(0).toFixed(1)} ${(pad.top + cH).toFixed(1)} Z`;

        // X labels
        const xLabels = document.getElementById('chart-x-labels');
        if (xLabels) xLabels.innerHTML = labels.map(l => `<span>${l}</span>`).join('');

        // Y grid lines
        const gridLines = [0, 20, 40, 60, 80, 100].map(v => {
            const y = yScale(v).toFixed(1);
            return `
            <line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
            <text x="${pad.left - 8}" y="${y}" fill="#5a5a6a" font-size="9" text-anchor="end" dominant-baseline="middle">${v}</text>`;
        }).join('');

        // Final SVG
        wrap.innerHTML = `<svg id="line-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px;cursor:crosshair">
            <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.3"/>
                    <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0"/>
                </linearGradient>
                <linearGradient id="areaGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.12"/>
                    <stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/>
                </linearGradient>
            </defs>
            ${gridLines}
            <line id="guide-line" x1="0" y1="${pad.top}" x2="0" y2="${pad.top + cH}" stroke="var(--clr-purple)" stroke-width="1" stroke-dasharray="4 2" style="display:none" />
            <!-- Target area -->
            <path d="${toArea(targetPoints)}" fill="url(#areaGrad2)" />
            <path d="${toPath(targetPoints)}" fill="none" stroke="#22d3ee" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.4"/>
            <!-- Score area -->
            <path d="${toArea(points)}" fill="url(#areaGrad)" class="chart-area-path"/>
            <path d="${toPath(points)}" fill="none" stroke="#8b5cf6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 8px rgba(139, 92, 246, 0.5))" class="chart-line-path"/>
            <!-- Data points -->
            ${points.map((v, i) => `<circle class="chart-dot" data-idx="${i}" data-val="${v}" data-target="${targetPoints[i].toFixed(1)}" cx="${xScale(i).toFixed(1)}" cy="${yScale(v).toFixed(1)}" r="4" fill="#8b5cf6" stroke="#fff" stroke-width="${i === points.length - 1 ? '2.5' : '1.5'}" style="filter:drop-shadow(0 0 4px rgba(139, 92, 246, 0.4))"/>`).join('')}
        </svg>
        <div id="chart-tooltip" class="chart-tooltip" style="display:none;position:absolute;pointer-events:none;z-index:100;backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1);background:rgba(10,12,20,0.8);box-shadow:0 10px 30px rgba(0,0,0,0.5)"></div>`
            ;

        // Interaction Logic
        const svg = document.getElementById('line-svg');
        const guide = document.getElementById('guide-line');
        const tooltip = document.getElementById('chart-tooltip');

        svg.addEventListener('mousemove', (e) => {
            const rect = svg.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const xRel = (mouseX / rect.width) * W;

            // Find closest point
            let closestIdx = 0;
            let minDist = Infinity;
            points.forEach((_, i) => {
                const dx = Math.abs(xScale(i) - xRel);
                if (dx < minDist) {
                    minDist = dx;
                    closestIdx = i;
                }
            });

            const px = xScale(closestIdx);
            const py = yScale(points[closestIdx]);

            guide.setAttribute('x1', px);
            guide.setAttribute('x2', px);
            guide.style.display = 'block';

            tooltip.style.display = 'block';
            tooltip.style.left = (px + 10) + 'px';
            tooltip.style.top = (py - 40) + 'px';
            tooltip.innerHTML = `
                <div style="font-weight:700;color:#fff">${labels[closestIdx]}</div>
                <div style="color:var(--clr-purple-light)">Score: ${points[closestIdx]}%</div>
                <div style="color:var(--clr-cyan);font-size:10px">Target: ${targetPoints[closestIdx].toFixed(0)}%</div>
            `;

            // Highlight dot
            document.querySelectorAll('.chart-dot').forEach((dot, idx) => {
                dot.setAttribute('r', idx === closestIdx ? '6' : '3.5');
                dot.style.opacity = idx === closestIdx ? '1' : '0.6';
            });
        });

        svg.addEventListener('mouseleave', () => {
            guide.style.display = 'none';
            tooltip.style.display = 'none';
            document.querySelectorAll('.chart-dot').forEach(dot => {
                dot.setAttribute('r', '3.5');
                dot.style.opacity = '1';
            });
        });
    }

    // ────────────────────────────────────────────────────────
    // CHART: BAR CHART
    // ────────────────────────────────────────────────────────
    function renderBarChart(skills) {
        const wrap = document.getElementById('bar-chart-wrap');
        if (!wrap) return;

        const colors = ['#7c5cfc', '#22d3ee', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6'];

        const categories = skills.length > 0
            ? skills.map((s, i) => {
                const name = typeof s === 'object' ? s.name : s;
                const manualPct = typeof s === 'object' ? s.level : null;
                return {
                    label: name,
                    pct: manualPct !== null ? manualPct : 0,
                    color: colors[i % colors.length]
                };
            })
            : [];

        if (categories.length === 0) {
            wrap.innerHTML = `<div class="empty-state-mini" style="text-align:center;padding:var(--sp-8);opacity:0.6;font-size:var(--fs-xs)">
                No skills recorded yet. Add them in your profile.
            </div>`;
            return;
        }

        wrap.innerHTML = categories.slice(0, 7).map(c => `
            <div class="bar-row">
                <span class="bar-label" title="${c.label}">${c.label}</span>
                <div class="bar-track" role="progressbar" aria-valuenow="${c.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${c.label}: ${c.pct}%">
                    <div class="bar-fill" style="--bar-color:${c.color}" data-pct="${c.pct}"></div>
                </div>
                <span class="bar-value" style="color:${c.color}">${c.pct}%</span>
            </div>`).join('');

        // Animate bars after render
        setTimeout(() => {
            document.querySelectorAll('.bar-fill').forEach((bar, i) => {
                setTimeout(() => {
                    bar.style.width = bar.dataset.pct + '%';
                }, i * 100);
            });
        }, 300);
    }


    // Global state for filters
    let curTimeFilter = 'today';
    let curReportFilter = 'today';

    // ── Chart 1: Analytic Overview filter ──
    window.updateTimeFilter = function (filter, el) {
        const parent = el.closest('.chart-widget');
        parent.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
        el.classList.add('active');
        curTimeFilter = filter;
        refreshAnalyticOverview();
    };

    // ── Chart 2: Reporting Performance filter ──
    window.updateReportFilter = function (filter, el) {
        const parent = el.closest('.chart-widget');
        parent.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
        el.classList.add('active');
        curReportFilter = filter;
        refreshReportPerformance();
    };

    function refreshCharts() {
        refreshAnalyticOverview();
        refreshReportPerformance();
    }

    function refreshAnalyticOverview() {
        const reports = Storage.getHourlyReports(targetUid);
        renderAnalyticChart('line-chart-wrap-1', reports);
    }

    function refreshReportPerformance() {
        const reports = Storage.getHourlyReports(targetUid);
        renderReportPerformanceChart('report-performance-chart-wrap', reports);
    }

    function renderAnalyticChart(containerId, reports) {
        const wrap = document.getElementById(containerId);
        if (!wrap) return;

        const now = new Date();
        const data = [];
        const labels = [];
        
        if (curTimeFilter === 'today') {
            const hCheckpoints = [9, 11, 13, 14, 16, 18];
            const myProjects = Storage.getProjects().filter(p => String(p.userId || p.ownerId) === String(targetUid));
            hCheckpoints.forEach(h => {
                labels.push(`${h}:00`);
                const timestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0).getTime();
                
                // Calculate performance score at this specific point in time
                const score = calculateActualTrend('growth', timestamp, myProjects, profile.skills || []);
                data.push(score);
            });
        } else if (curTimeFilter === 'week') {
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                labels.push(d.toLocaleDateString([], { weekday: 'short' }));
                const dailyReports = reports.filter(r => new Date(r.createdAt || r.timestamp).toDateString() === d.toDateString());
                // Activity score: (Number of reports / 2) * 100
                data.push(Math.min(100, (dailyReports.length / 2) * 100));
            }
        } else {
            // Month view: Average over 5-day chunks
            for (let i = 25; i >= 0; i -= 5) {
                const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                labels.push(d.toLocaleDateString([], { month: 'short', day: 'numeric' }));
                const monthlyReports = reports.filter(r => {
                    const rd = new Date(r.createdAt || r.timestamp);
                    return rd <= d && rd >= new Date(d.getTime() - 5*24*60*60*1000);
                });
                // Target: 2 reports per day * 5 days = 10 reports
                data.push(Math.min(100, (monthlyReports.length / 10) * 100));
            }
        }

        drawSVG(wrap, data, labels, '#8b5cf6', true); // Show target line for Left Chart
    }

    function renderReportPerformanceChart(containerId, reports) {
        const wrap = document.getElementById(containerId);
        if (!wrap) return;

        const now = new Date();
        const data = [];
        const labels = [];
        
        if (curReportFilter === 'today') {
            const windows = [9, 13, 14, 18];
            windows.forEach(h => {
                labels.push(`${h}:00`);
                // Check if any report exists for the windows (Update 1 or Update 2)
                const winId = h <= 13 ? 1 : 2;
                const r = reports.find(rep => {
                    const d = new Date(rep.createdAt || rep.timestamp);
                    return d.toDateString() === now.toDateString() && rep.window === winId;
                });
                data.push(r ? 100 : 0);
            });
        } else if (curReportFilter === 'week') {
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                labels.push(d.toLocaleDateString([], { weekday: 'short' }));
                const dailyReports = reports.filter(r => new Date(r.createdAt || r.timestamp).toDateString() === d.toDateString());
                data.push((dailyReports.length / 2) * 100);
            }
        } else {
            for (let i = 25; i >= 0; i -= 5) {
                const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                labels.push(d.toLocaleDateString([], { month: 'short', day: 'numeric' }));
                const monthlyReports = reports.filter(r => {
                    const rd = new Date(r.createdAt || r.timestamp);
                    return rd <= d && rd >= new Date(d.getTime() - 5*24*60*60*1000);
                });
                data.push(Math.min(100, (monthlyReports.length / 10) * 100));
            }
        }

        drawSVG(wrap, data, labels, '#10b981', false); // No target line for Right Chart
    }

    function drawSVG(wrap, data, labels, color, showTarget = false) {
        const rect = wrap.getBoundingClientRect();
        const W = rect.width || 400;
        const H = rect.height || 200;
        
        if (W === 0 || H === 0) {
            // Retry if layout not ready
            setTimeout(() => drawSVG(wrap, data, labels, color, showTarget), 100);
            return;
        }

        const pad = { top: 20, right: 30, bottom: 40, left: 45 };
        const cW = W - pad.left - pad.right;
        const cH = H - pad.top - pad.bottom;

        // Ensure data.length is at least 2 for scaling
        const displayData = data.length >= 2 ? data : (data.length === 1 ? [data[0], data[0]] : [0, 0]);
        const displayLabels = labels.length >= 2 ? labels : (labels.length === 1 ? [labels[0], labels[0]] : ['—', '—']);

        const xScale = (i) => pad.left + (i / (displayData.length - 1)) * cW;
        const yScale = (v) => pad.top + cH - (v / 100) * cH;

        const pathD = displayData.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`).join(' ');
        const areaD = `${pathD} L ${xScale(displayData.length - 1).toFixed(1)} ${(pad.top + cH).toFixed(1)} L ${pad.left.toFixed(1)} ${(pad.top + cH).toFixed(1)} Z`;
        
        // Target line at 70%
        const targetLineD = `M ${xScale(0).toFixed(1)} ${yScale(70).toFixed(1)} L ${xScale(displayData.length - 1).toFixed(1)} ${yScale(70).toFixed(1)}`;

        wrap.innerHTML = `
            <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:100% text-shadow: none;">
                <defs>
                    <linearGradient id="grad-${color.replace('#','')}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${color}" stop-opacity="0.2"/>
                        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
                    </linearGradient>
                </defs>
                <path d="${areaD}" fill="url(#grad-${color.replace('#','')})" />
                ${showTarget ? `<path d="${targetLineD}" fill="none" stroke="#22d3ee" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.5" />` : ''}
                <path d="${pathD}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                ${displayData.map((v, i) => `<circle cx="${xScale(i).toFixed(1)}" cy="${yScale(v).toFixed(1)}" r="4.5" fill="${color}" stroke="#fff" stroke-width="2" />`).join('')}
                ${displayLabels.map((l, i) => `<text x="${xScale(i)}" y="${H - 10}" text-anchor="middle" fill="#9898a6" font-size="10" font-family="Inter, system-ui">${l}</text>`).join('')}
                <text x="10" y="${yScale(0)}" fill="#5a5a6a" font-size="10" font-family="Inter, system-ui">0%</text>
                <text x="10" y="${yScale(50)}" fill="#5a5a6a" font-size="10" font-family="Inter, system-ui">50%</text>
                <text x="10" y="${yScale(100)}" fill="#5a5a6a" font-size="10" font-family="Inter, system-ui">100%</text>
            </svg>
        `;
    }

    window.submitHourlyReport = async function () {
        const now = new Date();
        const hr = now.getHours();

        // Define windows and their strict closure points
        const windows = [9, 11, 13, 15, 17, 18];
        let targetHr = -1;

        for (let i = 0; i < windows.length; i++) {
            const w = windows[i];
            const nextW = (i === windows.length - 1) ? 19 : windows[i + 1];
            if (hr >= w && hr < nextW) {
                targetHr = w;
                break;
            }
        }

        if (targetHr === -1) {
            await IrisModal.alert(`Reporting is currently unavailable. Windows are every 2 hours (09:00 - 18:00). Final submission expires at 19:00 (7 PM).`);
            return;
        }

        const reports = Storage.getHourlyReports(session.userId);
        const todayStr = now.toDateString();
        const dup = reports.find(r => new Date(r.createdAt).toDateString() === todayStr && r.window === targetHr);

        if (dup) {
            await IrisModal.alert(`You have already submitted your report for the ${targetHr === 18 ? '6:00 PM' : targetHr + ':00'} slot.`);
            return;
        }

        const slotLabel = targetHr === 18 ? "6:00 PM (Final)" : `${targetHr}:00`;
        const note = await IrisModal.prompt(`Enter your progress update for the ${slotLabel} window:`);
        if (!note) return;

        const report = Storage.saveHourlyReport({
            userId: session.userId,
            window: targetHr,
            note: note,
            timestamp: now.getTime()
        });

        // Sync report to Firestore
        if (Storage.saveActivityReportToFirebase) {
            Storage.saveActivityReportToFirebase(session.userId, report).catch(e => console.warn('Report sync failed:', e));
        }

        // Sync analytics summary to Firestore
        if (Storage.syncAnalytics) {
            const currentProfile = Storage.getProfile(session.userId);
            const myP = Storage.getProjects().filter(p => String(p.ownerId) === String(session.userId));
            const analyticsPayload = {
                userId: session.userId,
                overallScore: typeof computeScore === 'function' ? computeScore(currentProfile, myP) : 0,
                projectCount: myP.length,
                skillCount: (currentProfile?.skills || []).length,
                reportsCount: Storage.getHourlyReports(session.userId).length
            };
            Storage.syncAnalytics(session.userId, analyticsPayload).catch(e => console.warn('Analytics sync failed:', e));
        }

        await IrisModal.alert('Report submitted successfully! Your progress graph will update.');
        refreshCharts();
    };

    // Re-render charts on resize for full-width responsiveness
    window.addEventListener('resize', () => {
        if (outputEl && !outputEl.hidden) {
            refreshCharts();
        }
    });

    // ────────────────────────────────────────────────────────
    // CHART: SVG LINE CHART
    // ────────────────────────────────────────────────────────
    function renderLineChart(containerId, mode, projects, isLongTerm = false) {
        const wrap = document.getElementById(containerId);
        if (!wrap) return;

        const W = wrap.clientWidth || 400;
        const H = 200;
        const pad = { top: 16, right: 20, bottom: 20, left: 36 };
        const cW = W - pad.left - pad.right;
        const cH = H - pad.top - pad.bottom;

        const data = isLongTerm ? getLongTermTrendData(mode, projects) : getFilteredTrendData(mode, projects);
        const points = data.values;
        const labels = data.labels; // Detailed labels for tooltip

        // Distinct colors for each metric
        const colorMap = {
            'growth': '#8b5cf6',   // Purple
            'skills': '#22d3ee',   // Cyan
            'projects': '#f59e0b', // Amber
            'progress': '#10b981'  // Emerald
        };
        const color = colorMap[mode] || '#8b5cf6';
        const color2 = mode === 'growth' || mode === 'skills' ? '#22d3ee' : mode === 'projects' ? '#10b981' : '#f59e0b';

        const xScale = (i) => pad.left + (points.length > 1 ? (i / (points.length - 1)) * cW : cW / 2);
        const yScale = (v) => pad.top + cH - (v / 100) * cH;

        const toPath = (arr) => arr.length > 1
            ? arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`).join(' ')
            : `M ${xScale(0).toFixed(1)} ${yScale(arr[0]).toFixed(1)} L ${W - pad.right} ${yScale(arr[0]).toFixed(1)}`;

        const toArea = (arr) => `${toPath(arr)} L ${xScale(arr.length - 1).toFixed(1)} ${(pad.top + cH).toFixed(1)} L ${xScale(0).toFixed(1)} ${(pad.top + cH).toFixed(1)} Z`;

        // Y grid lines
        const gridLines = [0, 50, 100].map(v => {
            const y = yScale(v).toFixed(1);
            return `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
                    <text x="${pad.left - 8}" y="${y}" fill="#5a5a6a" font-size="9" text-anchor="end" dominant-baseline="middle">${v}</text>`;
        }).join('');

        wrap.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px;cursor:crosshair" class="analytics-svg">
            <defs>
                <linearGradient id="grad-${containerId}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${color}" stop-opacity="0.2"/>
                    <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
                </linearGradient>
            </defs>
            ${gridLines}
            <path d="${toArea(points)}" fill="url(#grad-${containerId})" />
            <path d="${toPath(points)}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 8px ${color}60)"/>
            ${points.map((v, i) => `<circle class="chart-dot" data-idx="${i}" cx="${xScale(i).toFixed(1)}" cy="${yScale(v).toFixed(1)}" r="4" fill="${color}" stroke="#fff" stroke-width="1.5"/>`).join('')}
            <line id="guide-${containerId}" x1="0" y1="${pad.top}" x2="0" y2="${pad.top + cH}" stroke="${color}" stroke-width="1" stroke-dasharray="4 2" style="display:none" />
        </svg>
        <div id="tooltip-${containerId}" class="chart-tooltip" style="display:none;position:absolute;pointer-events:none;z-index:100;backdrop-filter:blur(10px);min-width:120px;"></div>`;

        // Interaction
        const svg = wrap.querySelector('svg');
        const guide = wrap.querySelector(`#guide-${containerId}`);
        const tooltip = wrap.querySelector(`#tooltip-${containerId}`);

        svg.addEventListener('mousemove', (e) => {
            const rect = svg.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const xRel = (mouseX / rect.width) * W;

            let closestIdx = 0;
            let minDist = Infinity;
            points.forEach((_, i) => {
                const dx = Math.abs(xScale(i) - xRel);
                if (dx < minDist) { minDist = dx; closestIdx = i; }
            });

            const px = xScale(closestIdx);
            const py = yScale(points[closestIdx]);

            guide.setAttribute('x1', px);
            guide.setAttribute('x2', px);
            guide.style.display = 'block';

            tooltip.style.display = 'block';

            // Fix misalignment on right edge
            const isRightSide = px > W - 140;
            tooltip.style.left = isRightSide ? (px - 130) + 'px' : (px + 10) + 'px';
            tooltip.style.top = (py - 50) + 'px';
            tooltip.innerHTML = `
                <div style="font-weight:700;color:#fff">${labels[closestIdx]}</div>
                <div style="color:${color}">${mode.toUpperCase()}: ${points[closestIdx]}%</div>
            `;
        });

        svg.addEventListener('mouseleave', () => {
            guide.style.display = 'none';
            tooltip.style.display = 'none';
        });
    }

    function renderLineChartRaw(points, color1, color2) {
        // Replaced by refined renderLineChart
        refreshCharts();
    }

    // ────────────────────────────────────────────────────────
    // ANIMATED COUNTERS
    // ────────────────────────────────────────────────────────
    function animateCounters() {
        document.querySelectorAll('.counter-num').forEach(el => {
            if (el.dataset.animated) return;
            el.dataset.animated = 'true';

            const target = parseInt(el.dataset.target, 10);
            const suffix = el.dataset.suffix || '';
            const prefix = el.dataset.prefix || '';
            const dur = 900;
            const start = performance.now();
            const step = (now) => {
                const prog = Math.min((now - start) / dur, 1);
                const eased = 1 - Math.pow(1 - prog, 3);
                el.textContent = prefix + Math.floor(eased * target) + suffix;
                if (prog < 1) requestAnimationFrame(step);
                else el.textContent = prefix + target + suffix;
            };
            requestAnimationFrame(step);
        });
    }

    // ────────────────────────────────────────────────────────
    // HELPERS
    // ────────────────────────────────────────────────────────
    function computeCompletion(p) {
        const fields = [
            p.name, p.email, p.tagline, p.bio, p.location,
            p.skills?.length > 0,
            p.internship?.company, p.internship?.role,
            p.socialLinks?.github || p.socialLinks?.linkedin,
        ];
        return Math.round((fields.filter(Boolean).length / fields.length) * 100);
    }

    function computeScore(p, projects) {
        if (!projects || projects.length === 0) return 0;
        const ratedProjects = projects.filter(proj => proj.rating);
        if (ratedProjects.length === 0) return 0;

        const totalRating = ratedProjects.reduce((sum, pr) => sum + pr.rating, 0);
        const avgRating = totalRating / ratedProjects.length; // 0-5
        return Math.round((avgRating / 5) * 100);
    }

    function getFilteredTrendData(type, myProjects) {
        const mySkills = profile.skills || [];
        const values = [];
        const labels = [];
        const now = new Date();

        let steps = 6;

        if (curTimeFilter === 'today') {
            const hours = [9, 11, 13, 15, 17, 18];
            steps = hours.length;
            for (let h of hours) {
                const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0);
                labels.push((h === 18 ? '6 PM' : (h < 10 ? '0' + h : h) + ':00'));
                values.push(generateMockTrend(type, t.getTime(), myProjects, mySkills));
            }
        } else if (curTimeFilter === 'week') {
            // Include last 7 days but skip Sundays
            for (let i = 7; i >= 0; i--) {
                const t = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                if (t.getDay() === 0) continue; // Skip Sunday

                labels.push(t.toLocaleDateString('en-US', { weekday: 'short' }));
                values.push(generateMockTrend(type, t.getTime(), myProjects, mySkills));

                if (labels.length === 6) break; // We want 6 working days
            }
        } else { // month -> 4 weeks instead of 30 days
            steps = 4;
            for (let i = steps - 1; i >= 0; i--) {
                const t = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
                labels.push('Week ' + (steps - i));
                values.push(calculateActualTrend(type, t.getTime(), myProjects, mySkills));
            }
        }
        return { values, labels };
    }

    function getLongTermTrendData(type, myProjects) {
        const mySkills = profile.skills || [];
        const values = [];
        const labels = [];
        const now = new Date();

        for (let i = 7; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 30 * 24 * 60 * 60 * 1000);
            labels.push('Phase ' + (8 - i));
            values.push(calculateActualTrend(type, d.getTime(), myProjects, mySkills));
        }
        return { values, labels };
    }

    function calculateActualTrend(type, timestamp, projects, skills) {
        const reports = Storage.getHourlyReports(targetUid);
        
        if (type === 'projects') {
            const relevant = projects.filter(p => (p.createdAt || 0) <= timestamp);
            if (relevant.length === 0) return 0;
            const valid = relevant.filter(p => p.rating && p.rating > 0);
            if (valid.length === 0) return 30; // Baseline
            const avg = valid.reduce((s, p) => s + p.rating, 0) / valid.length;
            return Math.round((avg / 5) * 100);
        }

        if (type === 'skills') {
            if (!skills || skills.length === 0) return 0;
            const avg = skills.reduce((sum, sk) => sum + (sk.level || 0), 0) / skills.length;
            
            // Skill growth simulation relative to account age
            const created = profile.createdAt || (Date.now() - 30 * 86400000);
            const span = Date.now() - created;
            const progress = span > 0 ? (timestamp - created) / span : 1;
            const clamped = Math.max(0.4, Math.min(1.0, progress));
            return Math.round(avg * clamped);
        }

        if (type === 'growth') {
            const pScore = calculateActualTrend('projects', timestamp, projects, skills);
            const sScore = calculateActualTrend('skills', timestamp, projects, skills);
            const rScore = calculateActualTrend('progress', timestamp, projects, skills);
            
            // Weighted growth: 40% projects, 30% skills, 30% reporting
            return Math.round((pScore * 0.4) + (sScore * 0.3) + (rScore * 0.3));
        }

        if (type === 'progress') {
            const date = new Date(timestamp);
            const dayStr = date.toDateString();

            if (curTimeFilter === 'today') {
                // Check if reports exist for windows before or equal to this checkpoint
                const hour = date.getHours();
                const pastReports = reports.filter(r => {
                    const rd = new Date(r.createdAt || r.timestamp);
                    // Match window ID: 1 (9-13), 2 (14-18)
                    const isToday = rd.toDateString() === dayStr;
                    const isBefore = rd.getHours() <= hour;
                    return isToday && isBefore;
                });
                // Target: 2 reports per day
                return Math.min(100, Math.round((pastReports.length / 2) * 100));
            }
            // Week/Month fallback: daily average
            const dayReports = reports.filter(r => new Date(r.createdAt || r.timestamp).toDateString() === dayStr);
            return Math.min(100, Math.round((dayReports.length / 2) * 100));
        }

        return 50;
    }

    function generateMockTrend(type, timestamp, projects, skills) {
        return calculateActualTrend(type, timestamp, projects, skills);
    }

    function getLast8Months() {
        return []; // Disabled in favor of dynamic labels
    }

    function fmtDate(d) {
        if (!d) return '—';
        try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }); }
        catch { return d; }
    }

    function fmtDateShort(d) {
        if (!d) return '—';
        try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
        catch { return d; }
    }

    function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

    function arrowUp() {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;
    }
    function arrowDown() {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`;
    }

    function sparklineSVG(color = '#8b5cf6') {
        const h = [30, 55, 42, 70, 65, 80, 72, 90];
        const max = Math.max(...h); const min = Math.min(...h);
        const pts = h.map((v, i) => `${(i / (h.length - 1)) * 100},${100 - ((v - min) / (max - min)) * 100}`).join(' ');
        return `<svg class="stat-sparkline" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
    }

    function showError(msg) {
        const loadingEl = document.getElementById('analytics-loading');
        if (loadingEl) loadingEl.remove();
        const outputEl = document.getElementById('analytics-output');
        if (outputEl) {
            outputEl.hidden = false;
            outputEl.innerHTML = `<div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <div class="empty-state-title">Cannot Load Analytics</div>
                <div class="empty-state-desc">${msg}</div>
                ${isAdmin ? `<a href="students.html" class="btn btn-secondary btn-sm" style="margin-top:20px">← Go to Intern Directory</a>` : ''}
            </div>`;
        }
    }

    function initReveal() {
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) { 
                    e.target.classList.add('visible'); 
                    obs.unobserve(e.target); 
                }
            });
        }, { threshold: 0.06 });

        document.querySelectorAll('.reveal').forEach(el => {
            if (el.dataset.revealingInit) return;
            el.dataset.revealingInit = 'true';
            obs.observe(el);
        });
    }

    // ────────────────────────────────────────────────────────
    // SIDEBAR
    // ────────────────────────────────────────────────────────
    SidebarEngine.init = function(session) {
        const avatar = document.getElementById('user-avatar-sidebar');
        const nameEl = document.getElementById('user-name-sidebar');
        const roleEl = document.getElementById('user-role-sidebar');

        const p = isAdmin ? (Storage.getAdminProfile ? Storage.getAdminProfile(session.userId) : null) : Storage.getProfile(session.userId);
        const currentName = p?.name || session.displayName;

        if (avatar) {
            if (p?.avatar) {
                avatar.innerHTML = `<img src="${p.avatar}" alt="${currentName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
            } else {
                avatar.textContent = currentName[0].toUpperCase();
            }
        }
        if (nameEl) nameEl.textContent = currentName;
        if (roleEl) roleEl.textContent = isAdmin ? (p?.role || 'Administrator') : 'Intern';

        const nav = document.getElementById('sidebar-nav');
        const items = [
            { label: 'Dashboard', href: 'dashboard.html', icon: 'grid_view' },
            { label: 'My Profile', href: isAdmin ? 'admin-profile.html' : 'student-profile.html', icon: 'person' },
            ...(isAdmin
                ? [{ label: 'Interns', href: 'students.html', icon: 'group', active: true }]
                : [
                    { label: 'Leaderboard', href: 'leaderboard.html', icon: 'leaderboard' },
                    { label: 'Report Submission', href: 'report-submission.html', icon: 'description' },
                    { label: 'My Analytics', href: `student-analytics.html?student=${session.userId}`, icon: 'analytics', active: true }
                ]
            ),
            { label: 'Projects', href: 'projects.html', icon: 'folder' },
            { label: 'Doubts', href: 'doubts.html', icon: 'help_center' },
        ];

        if (nav) {
            nav.innerHTML = '<div class="nav-section-label">Menu</div>' +
                items.map(item => `
                <a class="nav-item${item.active ? ' active' : ''}" href="${item.href}" aria-current="${item.active ? 'page' : 'false'}">
                    <span class="nav-icon" aria-hidden="true"><span class="material-symbols-outlined">${item.icon}</span></span>
                    <span>${item.label}</span>
                </a>`).join('');
        }

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
    }

    function setupDetailHandlers() {
        const triggers = document.querySelectorAll('.detail-trigger');
        triggers.forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const row = document.getElementById(`details-${id}`);
                const isHidden = row.style.display === 'none';

                // Close other open rows for accordion effect
                document.querySelectorAll('.expandable-details-row').forEach(r => {
                    if (r !== row) {
                        r.style.display = 'none';
                        const otherBtn = document.querySelector(`.detail-trigger[data-id="${r.id.replace('details-', '')}"]`);
                        if (otherBtn) otherBtn.textContent = 'Details ▾';
                        r.classList.remove('active');
                    }
                });

                if (isHidden) {
                    row.style.display = 'table-row';
                    setTimeout(() => row.classList.add('active'), 10);
                    btn.textContent = 'Hide Details ▴';
                } else {
                    row.classList.remove('active');
                    setTimeout(() => row.style.display = 'none', 300);
                    btn.textContent = 'Details ▾';
                }
            });
        });
    }

    // ── Real-time Sync Listener ──
    window.addEventListener('iris-data-sync', (e) => {
        // Only refresh if the update is relevant to THIS dashboard
        if (e.detail.type === 'reports' || (e.detail.type === 'users' && e.detail.userId === targetUid)) {
            console.log(`[Analytics] ${e.detail.type} synced, updating dashboard...`);
            const p = Storage.getProfile(targetUid);
            if (!p) return; // Guard against empty profile during sync
            
            const projs = Storage.getProjects().filter(pr => String(pr.userId || pr.ownerId) === String(targetUid));
            
            outputEl.innerHTML = buildDashHTML(p, projs);
            runRefresh();
        }
    });

})();

