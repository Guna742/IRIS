/**
 * InternTrack — Dashboard Logic (Gold Version)
 * Role-aware render, animated counters, sidebar, toasts.
 * Includes explicit error handling to prevent silent UI crashes.
 */

'use strict';

(() => {
  // ── Auth Guard ──
  let session;
  try {
    session = Auth.requireAuth();
    if (!session) return;
  } catch (err) {
    console.error('[Dashboard] Auth failure:', err);
    return;
  }

  const isAdmin = session.role === 'admin';

  // ── Sync latest data ──
  try {
    if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
      Storage.fetchEverything();
    }
  } catch (err) {
    console.warn('[Dashboard] Data sync initialization failed:', err);
  }

  // ── Real-time Listener ──
  window.addEventListener('iris-data-sync', (e) => {
    console.log('[Dashboard] Live Cloud Update:', e.detail.type);
    render(); 
  });

  // ── DOM refs ──
  const statsGrid = document.getElementById('stats-grid');
  const quickActions = document.getElementById('quick-actions');
  const recentProjList = document.getElementById('recent-projects-list');
  const welcomeTitle = document.getElementById('welcome-title');
  const userAvatarSb = document.getElementById('user-avatar-sidebar');
  const userNameSb = document.getElementById('user-name-sidebar');
  const userRoleSb = document.getElementById('user-role-sidebar');
  const logoutBtn = document.getElementById('logout-btn');

  // ── UI Helpers ──
  const sparklineSVG = (color = '#8b5cf6') => `
    <svg class="stat-sparkline" viewBox="0 0 100 40" preserveAspectRatio="none">
        <path d="M0 35 Q 15 35, 25 25 T 50 15 T 75 25 T 100 5" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" />
        <path d="M0 35 Q 15 35, 25 25 T 50 15 T 75 25 T 100 5 L 100 40 L 0 40 Z" fill="${color}" fill-opacity="0.1" />
    </svg>`;

  const arrowUp = () => `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;

  // ── Main Render Logic ──
  function render() {
    try {
      console.log('[Dashboard] Initializing final render sequence...');
      
      // 1. Data Retrieval (Safe check)
      if (typeof Storage === 'undefined') throw new Error('Storage module not found');
      
      const projects = Storage.getProjects() || [];
      const profiles = Storage.getProfiles() || {};
      const allProfiles = Object.values(profiles);
      const profile = Storage.getProfile(session.userId) || { skills: [] };

      // ── Heartbeat: Mark user as active ──
      if (session && session.userId && !isAdmin) {
          Storage.saveProfile(session.userId, { ...profile, lastActive: Date.now() });
      }

      // 2. User Info
      const adminProfile = isAdmin ? (Storage.getAdminProfile ? Storage.getAdminProfile(session.userId) : null) : null;
      const currentName = (isAdmin ? adminProfile?.name : profile?.name) || session.displayName || 'I.R.I.S User';
      const currentAvatar = isAdmin ? adminProfile?.avatar : profile?.avatar;
      // ── 1. Dashboard Hero (WOW Fix) ──
      if (welcomeTitle) {
        if (isAdmin) {
          welcomeTitle.innerHTML = `
            <div class="dash-hero-title">Welcome, Command Center 🛠️</div>
            <div class="dash-hero-sub">Managing ${allProfiles.length} active interns today.</div>
          `;
        } else {
          const name = (currentName || 'Intern').split(' ')[0];
          welcomeTitle.innerHTML = `
            <div class="dash-hero-title ripple-text">Hey ${name}, You're in the Top 13%</div>
            <div class="dash-hero-sub">Outperforming ${Math.floor(allProfiles.length * 0.87)} peers this week. Keep pushing!</div>
          `;
        }
      }

      // ── 2. Global XP Bar Activation ──
      const xpBar = document.getElementById('global-xp-bar');
      if (xpBar && !isAdmin && profile) {
        xpBar.style.display = 'block';
        const points = profile.points || 0;
        const currentLevel = Math.floor(points / 500) + 1;
        const currentXP = points % 500;
        const nextXP = 500;
        const fillPct = Math.min(100, (currentXP / nextXP) * 100);
        
        document.getElementById('rank-lvl-current').textContent = `Level ${currentLevel}`;
        document.getElementById('rank-lvl-next').textContent = `Level ${currentLevel + 1}`;
        document.getElementById('next-lvl-xp').textContent = `${currentXP} / ${nextXP} XP`;
        document.getElementById('global-xp-fill').style.width = `${fillPct}%`;
      }

      // 3. Components
      renderStats(projects, allProfiles, profile);
      renderInsights(projects, allProfiles, profile);
      renderMission(isAdmin, profile);
      renderJourney(isAdmin, profile, projects);
      renderSkills(isAdmin, profile);
      renderActions();
      renderRecentProjects(projects);
      renderRecentReports(allProfiles);

      // 4. Polish
      animateCounters();
      
      if (typeof initMagneticButtons === 'function') initMagneticButtons();
      if (typeof init3DTilt === 'function') init3DTilt();
      if (typeof initScrollReveals === 'function') initScrollReveals();

    } catch (err) {
      console.error('[Dashboard] Render Crash:', err);
    }
  }

  function renderStats(projects, allProfiles, profile) {
    if (!statsGrid) return;
    
    let statsData = [];
    if (isAdmin) {
      const totalInterns = allProfiles.length;
      const totalSkills = allProfiles.reduce((acc, p) => acc + (p.skills?.length || 0), 0);
      const avgSkills = totalInterns > 0 ? Math.round(totalSkills / totalInterns) : 0;
      const ratedProjects = projects.filter(p => p.rating).length;
      const completionRate = projects.length > 0 ? Math.round((ratedProjects / projects.length) * 100) : 0;

      statsData = [
        { label: 'Total Projects', value: projects.length, icon: 'folder', color: '#6366F1', trend: '+12%', comic: 'Building the future!', clickable: true, href: 'projects.html' },
        { label: 'Interns', value: totalInterns, icon: 'group', color: '#06B6D4', trend: 'Active', comic: 'Your elite squad', clickable: true, href: 'students.html' },
        { label: 'Avg Skills', value: avgSkills, icon: 'bolt', color: '#8B5CF6', trend: 'Growing', comic: 'Unstoppable growth' },
        { label: 'Completion', value: completionRate, suffix: '%', icon: 'task_alt', color: '#10B981', trend: '+5%', comic: 'Shipping fast!' },
      ];
    } else {
      const myProjects = projects.filter(p => (p.userId || p.ownerId) === session.userId).length;
      const teamSize = allProfiles.filter(p => p.internship?.company && p.internship.company === profile?.internship?.company).length;
      
      let dayNumber = 1;
      if (profile && profile.createdAt) {
        const diffTime = Math.abs(Date.now() - profile.createdAt);
        dayNumber = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      }

      // ── Get Reward Points for Intern ──
      const points = profile.points || 0;
      const rank = (Storage.getInternRank && profile.userId) ? Storage.getInternRank(profile.userId) : 1;
      
      // Level Title calculation (Rename only, no logic change as requested)
      let levelTitle = points < 500 ? 'Level 1: Beginner' : points < 1500 ? 'Level 5: Consistent' : points < 3000 ? 'Level 10: Pro' : 'Elite';
      const streakDays = Storage.getInternStreak ? Storage.getInternStreak(session.userId) : (profile.streak || 0);

      statsData = [
        { label: 'Leaderboard Rank', value: rank, prefix: '#', icon: 'emoji_events', class: 'c-rank', comic: rank === 1 ? 'King of the hill! 🏆' : 'Climbing fast! 📈', clickable: true, href: 'leaderboard.html' },
        { label: 'Current Phase', value: points % 500, suffix: '/500', icon: 'stars', class: 'c-xp', comic: `Consistent progress builds a legacy! 🚀`, isXP: true },
        { label: 'Daily Streak', value: streakDays, suffix: ' Days', icon: 'local_fire_department', class: 'c-streak', comic: streakDays > 0 ? `🔥 Keep the momentum alive!` : 'Start your streak today!' },
        { label: 'Internship Path', value: dayNumber, icon: 'calendar_month', class: 'c-growth', comic: 'The journey continues! 🏹', prefix: 'Day ' },
      ];
    }

    statsGrid.innerHTML = statsData.map((s, i) => `
      <div class="stat-card reveal anim-d${i + 1} card-3d ${s.class || ''} ${s.clickable ? 'clickable-stat' : ''}" 
           ${s.clickable ? `onclick="window.location.href='${s.href}'"` : ''}>
        <div class="glare" aria-hidden="true"></div>
        <div class="stat-card-head">
            <div class="stat-card-label">${s.label}</div>
            <div class="stat-card-icon">
              <span class="material-symbols-outlined">${s.icon}</span>
            </div>
        </div>
        <div class="stat-card-value">
          <span class="stat-prefix">${s.prefix || ''}</span>
          <span class="counter-num" data-target="${s.value}">${s.value}</span>
          <span class="stat-suffix">${s.suffix || ''}</span>
        </div>
        ${s.isXP ? `
          <div class="xp-wrapper">
            <div class="xp-header"><span>Progression: ${s.value}/500</span><span>Next level target</span></div>
            <div class="xp-bar-bg"><div class="xp-bar-fill" style="width: ${(s.value/500)*100}%"></div></div>
          </div>
        ` : `
          <div class="stat-card-trend up">
            ${arrowUp()}
            <span class="trend-text">Leveling Up</span>
          </div>
        `}
        <div class="stat-comic-text" style="font-size:11px; margin-top:10px; opacity:0.8;">${s.comic || ''}</div>
      </div>
    `).join('');
  }

  function renderActions() {
    if (!quickActions) return;
    const actions = isAdmin ? [
      { label: 'My Sanctuary', desc: 'Manage your admin identity', href: 'admin-profile.html', icon: 'person', color: 'rgba(99,102,241,.1)' },
      { label: 'Onboard Intern', desc: 'Add a new talent to the squad', href: 'profile-builder.html?action=new-intern', icon: 'person_add', color: 'rgba(6,182,212,.12)' },
      { label: 'The Registry', desc: 'The master intern inventory', href: 'students.html', icon: 'school', color: 'rgba(124,92,252,.1)' },
    ] : [
      { label: 'Drop Progress', desc: 'Log your hourly achievements', href: 'report-submission.html', icon: 'description', color: 'rgba(16,185,129,.12)' },
      { label: 'Performance', desc: 'The numbers don\'t lie', href: `student-analytics.html?student=${session.userId}`, icon: 'analytics', color: 'rgba(99,102,241,.12)' },
      { label: 'Glory Board', desc: 'See where you stand globally', href: 'leaderboard.html', icon: 'leaderboard', color: 'rgba(245,158,11,.1)' },
    ];
    quickActions.innerHTML = actions.map((a, i) => `
      <a class="action-tile btn-magnetic anim-stagger visible" style="transition-delay: ${i * 0.1}s" href="${a.href}">
        <div class="action-icon" style="background:${a.color}"><span class="material-symbols-outlined">${a.icon}</span></div>
        <div class="action-content">
          <div class="action-label">${a.label}</div>
          <div class="action-desc">${a.desc}</div>
        </div>
        <span class="material-symbols-outlined arrow-icon">arrow_forward</span>
      </a>
    `).join('');
  }

  function renderRecentProjects(projects) {
    if (!recentProjList) return;
    const recent = projects.slice(0, 4);
    if (recent.length === 0) {
      recentProjList.innerHTML = `<p class="text-muted text-sm" style="padding: 20px 0">Oops… nothing here yet 👀</p>`;
      return;
    }
    recentProjList.innerHTML = recent.map((p, i) => `
      <div class="proj-item anim-stagger visible card-3d" style="transition-delay: ${i * 0.15}s">
        <div class="glare" aria-hidden="true"></div>
        <div class="proj-thumb" style="background:${p.screenshot ? 'none' : '#8b5cf6'}">
          ${p.screenshot ? `<img src="${p.screenshot}" alt="${p.title}">` : `<span>${p.title[0]}</span>`}
        </div>
        <div class="proj-info">
          <div class="proj-name">${p.title}</div>
          <div class="proj-tech">${(p.techStack || []).slice(0, 2).join(' · ')}</div>
        </div>
        <a class="proj-link btn-magnetic" href="${p.liveLink || '#'}" target="_blank">↗</a>
      </div>
    `).join('');
  }

  function renderRecentReports(allProfiles) {
    const list = document.getElementById('recent-reports-list');
    const card = document.getElementById('reports-card');
    const title = card ? card.querySelector('.dash-card-title') : null;
    if (!list || !card) return;

    if (!isAdmin) {
      if (title) title.textContent = 'My Recent Reports';
    }

    const reportsAll = Storage.getHourlyReports() || [];
    const reports = isAdmin ? reportsAll : reportsAll.filter(r => String(r.userId) === String(session.userId));

    if (reports.length === 0) {
      list.innerHTML = `<p class="text-muted" style="padding: 20px 0; font-size: 13px;">No reports submitted yet.</p>`;
      // Keep card hidden if no project data either? No, we show empty state.
      card.style.display = 'block';
      return;
    }
    card.style.display = 'block';
    list.innerHTML = '';
    
    reports.sort((a,b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0)).slice(0, 6).forEach((r, i) => {
      const p = allProfiles.find(prof => prof.userId === r.userId) || { name: 'Unknown' };
      const subDate = new Date(r.timestamp || r.createdAt);
      const deadline = r.window === 1 ? 13 : 18;
      const isLate = subDate.getHours() >= deadline;
      const statusColor = isLate ? '#f59e0b' : '#10b981';

      list.innerHTML += `
        <div class="proj-item visible card-3d" style="padding: 10px 12px; margin-bottom: 8px; transition-delay: ${i * 0.05}s; border-left: 3px solid ${statusColor}">
          <div class="glare" aria-hidden="true"></div>
          <div class="proj-info" style="margin:0; width:100%">
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%">
                <div style="font-weight:600; font-size:14px; color: var(--clr-text-main)">${isAdmin ? p.name : 'Report Slot '+r.window+':00'}</div>
                <div style="font-size:10px; font-weight:800; color:${statusColor}; background:${statusColor}20; padding:2px 6px; border-radius:4px;">${isLate ? 'LATE' : 'ON TIME'}</div>
            </div>
            <div style="font-size:12px; color:var(--clr-text-muted); display:flex; justify-content:space-between; margin-top:2px;">
                <span>${isAdmin ? 'Slot ' + r.window + ':00 — ' : ''}${r.note || r.task || 'Progress update'}</span>
                <span style="opacity:0.6">${subDate.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
            </div>
          </div>
        </div>
      `;
    });
  }

  function renderInsights(projects, allProfiles, profile) {
    const el = document.getElementById('insights-content');
    if (!el) return;

    if (isAdmin) {
      const activeCount = allProfiles.filter(p => (Date.now() - (p.lastActive || 0)) < 86400000 * 2).length;
      el.innerHTML = `
        <div style="display:flex; align-items:center; gap:20px;">
          <div class="insights-icon-glow">🤖</div>
          <div style="flex:1">
            <h4 style="font-size:14px; margin-bottom:4px; font-family:var(--font-comic)">System Intelligence 🧠</h4>
            <div class="insights-text">
                ${activeCount > 0 
                  ? `<span style="color:var(--clr-success); font-weight:700;">${activeCount} interns active</span> in the last 48 hours. 🚀` 
                  : `<span style="color:var(--clr-text-muted);">No collective traces detected...</span> standing by for intern activity. 🛰️`}
                ${projects.length > 0 
                  ? `<br>The team improved performance by <b>12%</b> this week. Unbelievable pace! 🔥` 
                  : `<br>Systems operational. Ready to analyze intern growth patterns.`}
            </div>
          </div>
        </div>`;
    } else {
      const points = profile.points || 0;
      const allReports = (Storage.getHourlyReports ? Storage.getHourlyReports(session.userId) : []);
      const reports = allReports.sort((a,b) => (b.timestamp || b.createdAt) - (a.timestamp || a.createdAt));
      const reportsToday = reports.filter(r => (Date.now() - (r.timestamp || r.createdAt)) < 86400000).length;
      
      // ── AI Report Scoring ──
      let scoringMsg = "";
      if (reports.length > 0) {
          const lastReport = reports[0];
          const evalRes = Storage.calculateReportScore ? Storage.calculateReportScore(lastReport) : { score: 75, feedback: "Keep it up!" };
          scoringMsg = `
            <div style="margin-top:10px; padding:10px; background:rgba(255,255,255,0.03); border-radius:10px; border-left:4px solid ${evalRes.score >= 70 ? '#10B981' : '#F59E0B'}">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-weight:700; color:white; font-size:12px;">Report Quality: ${evalRes.score}/100</span>
                    <span class="badge badge-sm" style="background:var(--bg-main); border:1px solid rgba(255,255,255,0.1)">AI Evaluated</span>
                </div>
                <div style="font-size:11px; opacity:0.8; line-height:1.4">🤖: ${evalRes.feedback}</div>
            </div>`;
      }

      const rankPercent = 94;
      let insightMsg = reportsToday === 0 
          ? "You missed today's report! Start your mission to preserve your streak ⚠️" 
          : `You're close to Top 5! Keep this momentum to reach <b>Pro</b> status. ⚡`;

      el.innerHTML = `
        <div style="display:flex; align-items:center; gap:20px;">
          <div class="insights-icon-glow">🤖</div>
          <div style="flex:1">
            <h4 style="font-size:14px; margin-bottom:4px; font-family:var(--font-comic)">AI Journey Guide 🧠</h4>
            <div class="insights-text">
                ${points > 0 ? `You've outperformed <b>${rankPercent}% of interns</b> this week! ✨` : 'Let\'s start your journey!'} 
                <p style="margin-top:6px; font-size:12px; color:var(--clr-text-secondary);">${insightMsg}</p>
                ${scoringMsg}
            </div>
          </div>
        </div>`;
    }
  }

  function renderMission(isAdmin, profile) {
    const card = document.getElementById('checklist-card');
    const el = document.getElementById('checklist-content');
    if (!el || isAdmin) {
        if (card) card.style.display = 'none';
        return;
    }
    
    if (card) card.style.display = 'block';

    // ── Check if report submitted today ──
    const reports = Storage.getHourlyReports(session.userId) || [];
    const hasReportToday = reports.some(r => {
        const d = new Date(r.timestamp || r.createdAt);
        return d.toDateString() === new Date().toDateString();
    });

    // ── Check if project comments reviewed/replied ──
    const projects = Storage.getProjects() || [];
    const myProjects = projects.filter(p => (p.userId || p.ownerId) === session.userId);
    const hasReplied = myProjects.some(p => {
        if (!p.comments || p.comments.length === 0) return false;
        const lastCmt = p.comments[p.comments.length - 1];
        return lastCmt.role === 'user' || lastCmt.userId === session.userId;
    });

    // ── Check Streak Maintenance ──
    const streak = Storage.getInternStreak ? Storage.getInternStreak(session.userId) : 0;

    // ── Check if leaderboard visited today ──
    const visitedLeaderboard = Storage.isMissionVisited ? Storage.isMissionVisited('leaderboard', session.userId) : false;
    const visitedPerformance = Storage.isMissionVisited ? Storage.isMissionVisited('performance', session.userId) : false;

    const tasks = [
        { label: 'Submit today\'s report', done: hasReportToday, href: 'report-submission.html' },
        { label: 'Review yesterday\'s performance', done: reports.length > 0 || visitedPerformance, href: `student-analytics.html?student=${session.userId}` },
        { label: 'Maintain your streak 🔥', done: streak > 0, href: 'dashboard.html' },
        { label: 'Check weekly leaderboard rank', done: visitedLeaderboard, href: 'leaderboard.html' }
    ];

    el.innerHTML = tasks.map(t => `
        <div class="checklist-item">
            <div class="check-circle ${t.done ? 'checked' : ''}" onclick="window.location.href='${t.href}'">
                ${t.done ? '<span class="material-symbols-outlined" style="font-size:14px">check</span>' : ''}
            </div>
            <div class="checklist-text ${t.done ? 'completed' : ''}">${t.label}</div>
            <a href="${t.href}" class="material-symbols-outlined" style="color:var(--clr-text-muted); font-size:18px; text-decoration:none;">arrow_forward</a>
        </div>
    `).join('');
  }

  function renderJourney(isAdmin, profile, projects) {
    const el = document.getElementById('journey-content');
    if (!el) return;

    if (isAdmin) {
        const cardTitle = el.closest('.dash-card')?.querySelector('.dash-card-title');
        if (cardTitle) cardTitle.textContent = 'Platform Growth Matrix 📈';
        
        const totalReports = Storage.getHourlyReports()?.length || 0;
        const totalPoints = Object.values(Storage.getProfiles() || {}).reduce((acc, p) => acc + (p.points || 0), 0);
        
        el.innerHTML = `
            <div style="padding: 10px 0;">
                <p class="text-muted text-sm" style="margin-bottom: 12px;">Reviewing platform-wide performance trends.</p>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="font-size: 10px; color: var(--clr-text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px;">Total Reports</div>
                        <div style="font-size: 18px; font-weight: 800; color: var(--clr-accent);">${totalReports}</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="font-size: 10px; color: var(--clr-text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px;">Global XP Pool</div>
                        <div style="font-size: 18px; font-weight: 800; color: #10B981;">${totalPoints}</div>
                    </div>
                </div>
            </div>`;
        return;
    }

    const points = profile?.points || 0;
    const diffTime = Math.abs(Date.now() - (profile?.createdAt || Date.now()));
    const dayNumber = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const steps = [
        { title: 'The Start 🐣', desc: 'Welcome to IRIS', date: 'Day 1', active: true },
        { title: 'First Drop 🚀', desc: 'Log your initial task', date: 'Done', active: points > 0 },
        { title: 'Consistency King 👑', desc: 'Maintain 5-day streak', date: profile?.streak >= 5 ? 'Active' : `${profile?.streak || 0}/5`, active: profile?.streak >= 5 },
        { title: 'Pro Transition ⚡', desc: 'Reach 1000 XP', date: points >= 1000 ? 'Unlocked' : `${points}/1000`, active: points >= 1000 },
    ];

    el.innerHTML = `
        <div class="journey-line">
            ${steps.map(s => `
                <div class="journey-step ${s.active ? 'active' : ''}">
                    <div class="journey-title">${s.title}</div>
                    <div class="journey-desc">${s.desc} • <span style="color:var(--clr-primary)">${s.date}</span></div>
                </div>
            `).join('')}
        </div>
    `;
  }

  function renderSkills(isAdmin, profile) {
    const el = document.getElementById('skills-content');
    if (!el) return;

    if (isAdmin) {
        const cardTitle = el.closest('.dash-card')?.querySelector('.dash-card-title');
        if (cardTitle) cardTitle.textContent = 'Admin Oversight 🛡️';
        
        const adminProfiles = Object.values(Storage.getProfiles() || {}).filter(p => p.role === 'admin' || p.isAdmin);
        // Fallback: Check if Storage has a separate getAdmins() or equivalent
        const allAdmins = adminProfiles.length > 0 ? adminProfiles : [{ name: 'System Root', role: 'admin', lastActive: Date.now() }];

        el.innerHTML = `
            <div class="admin-list-mini" style="display:flex; flex-direction:column; gap:12px;">
                <p class="text-muted text-xs" style="margin-bottom:8px;">Currently authorized administrators:</p>
                ${allAdmins.map(adm => `
                    <div style="display:flex; align-items:center; gap:12px; padding:10px; background:rgba(255,255,255,0.03); border-radius:10px; border:1px solid rgba(255,255,255,0.05);">
                        <div class="user-avatar" style="width:32px; height:32px; font-size:12px;">${adm.name[0]}</div>
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${adm.name}</div>
                            <div style="font-size:10px; opacity:0.6;">Active Administrator</div>
                        </div>
                        <div style="width:8px; height:8px; background:#10B981; border-radius:50%; box-shadow:0 0 10px #10B981;"></div>
                    </div>
                `).join('')}
            </div>
        `;
        return;
    }

    // ── Real calculation logic (or intelligent mock based on data) ──
    const reports = (Storage.getHourlyReports() || []).filter(r => r.userId === session.userId);
    const projects = (Storage.getProjects() || []).filter(p => (p.userId || p.ownerId) === session.userId);
    
    // Consistency: based on reports frequency
    const consistency = Math.min(95, Math.max(40, (reports.length * 10)));
    
    // Documentation: based on total words in reports
    const totalWords = reports.reduce((acc, r) => acc + (r.description?.length || 0), 0);
    const documentation = Math.min(95, Math.max(30, Math.floor(totalWords / 20)));

    // Communication: based on comments
    const totalComments = projects.reduce((acc, p) => acc + (p.comments?.length || 0), 0);
    const communication = Math.min(95, Math.max(35, totalComments * 15));

    // Velocity: based on project status
    const completed = projects.filter(p => p.status === 'Completed').length;
    const velocity = Math.min(95, Math.max(25, (completed / Math.max(1, projects.length)) * 100));

    const skills = [
        { name: 'Consistency', val: consistency, color: '#10B981' },
        { name: 'Documentation', val: documentation, color: '#6366F1' },
        { name: 'Communication', val: communication, color: '#F59E0B' },
        { name: 'Velocity', val: velocity, color: '#EC4899' },
    ];

    el.innerHTML = skills.map(s => `
        <div class="skill-bar-item">
            <div class="skill-header">
                <span>${s.name}</span>
                <span>${s.val}%</span>
            </div>
            <div class="skill-progress-bg">
                <div class="skill-progress-fill" style="width: ${s.val}%; background-color: ${s.color};"></div>
            </div>
        </div>
    `).join('');
  }

  function animateCounters() {
    document.querySelectorAll('.counter-num').forEach(el => {
      if (el.dataset.animated) return;
      el.dataset.animated = 'true';

      const target = parseInt(el.dataset.target, 10) || 0;
      if (target === 0) { el.textContent = '0'; return; }
      
      const duration = 1500;
      const start = performance.now();
      const step = now => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - (1 - progress) ** 4;
        const val = Math.floor(eased * target);
        el.textContent = val;
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  // ── Initialize ──
  try {
    SidebarEngine.init();
    render();
  } catch (err) {
    console.error('[Dashboard] Initialization fault:', err);
  }

  if (logoutBtn) logoutBtn.addEventListener('click', () => Auth.logout());
})();
