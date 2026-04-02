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

      // 2. User Info
      const adminProfile = isAdmin ? (Storage.getAdminProfile ? Storage.getAdminProfile(session.userId) : null) : null;
      const currentName = (isAdmin ? adminProfile?.name : profile?.name) || session.displayName || 'I.R.I.S User';
      const currentAvatar = isAdmin ? adminProfile?.avatar : profile?.avatar;
      if (welcomeTitle) {
          welcomeTitle.innerHTML = `
            <div class="welcome-wrap" style="display:flex; align-items:center; gap:15px;">
              <span class="anim-title"><span>Hey ${currentName.split(' ')[0]} 👋 <span style="display:block; font-size: 0.5em; opacity: 0.8; font-family: var(--font-primary); font-weight: 400; margin-top: 4px;">Ready to dominate today?</span></span></span>
              <div class="welcome-mascot anim-floating" style="font-size: 40px; filter: drop-shadow(0 0 10px var(--clr-accent-glow));">🚀</div>
            </div>`;
      }

      // 3. Components
      renderStats(projects, allProfiles, profile);
      renderInsights(projects, allProfiles, profile);
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

      statsData = [
        { label: 'Leaderboard Rank', value: rank, prefix: '#', icon: 'emoji_events', color: '#F59E0B', trend: 'Global', comic: rank === 1 ? 'King of the hill! 🏆' : 'Climbing fast! 📈', clickable: true, href: 'leaderboard.html' },
        { label: `Level ${Math.floor(points/100) + 1} XP`, value: points % 100, suffix: '/100', icon: 'stars', color: '#6366F1', trend: 'Streak', comic: 'Goal: Level Up! ⭐', isXP: true },
        { label: 'Recent Growth', value: 87, suffix: '%', icon: 'trending_up', color: '#06B6D4', trend: '+12%', comic: 'You\'re killing it! ⚡' },
        { label: 'Internship Day', value: dayNumber, icon: 'calendar_month', color: '#10B981', trend: 'Streak', comic: '🔥 5 Day Streak', prefix: 'Day ' },
      ];
    }

    statsGrid.innerHTML = statsData.map((s, i) => `
      <div class="stat-card reveal anim-d${i + 1} card-3d ${i === 0 ? 'first-card' : ''} ${s.clickable ? 'clickable-stat' : ''}" 
           ${s.clickable ? `onclick="window.location.href='${s.href}'"` : ''}>
        <div class="glare" aria-hidden="true"></div>
        <div class="stat-card-head">
            <div class="stat-card-label">${s.label}</div>
            <div class="stat-card-icon" style="background:${s.color}15">
              <span class="material-symbols-outlined" style="display:flex; align-items:center; justify-content:center; color:${s.color}; font-size:18px;">${s.icon}</span>
            </div>
        </div>
        <div class="stat-card-value">
          ${s.prefix ? `<span class="stat-prefix">${s.prefix}</span>` : ''}
          <span class="counter-num" data-target="${s.value}">${s.value}</span>
          ${s.suffix ? `<span class="stat-suffix">${s.suffix}</span>` : ''}
        </div>
        ${s.isXP ? `
          <div class="xp-wrapper">
            <div class="xp-header"><span>Goal: ${s.value}/100</span><span>Next Level in ${100 - s.value} XP</span></div>
            <div class="xp-bar-bg"><div class="xp-bar-fill" style="width: ${s.value}%"></div></div>
          </div>
        ` : `
          <div class="stat-card-trend up">
            ${arrowUp()}
            <span class="trend-text">${s.trend}</span>
          </div>
        `}
        <div class="stat-comic-text">${s.comic || ''}</div>
        ${sparklineSVG(s.color)}
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
          <div class="insights-icon-glow">💡</div>
          <div style="flex:1">
            <h4 style="font-size:14px; margin-bottom:4px; font-family:var(--font-comic)">Platform Health Trend 🌍</h4>
            <div class="insights-text">
                <span style="color:var(--clr-success); font-weight:700;">${activeCount} interns active</span> in the last 48 hours. 🚀 
                ${projects.length > 0 ? `The team has built <b>${projects.length} projects</b>. Great pace! 🔥` : 'Ready to onboard?'}
            </div>
          </div>
        </div>`;
    } else {
      const points = profile.points || 0;
      const reports = Storage.getHourlyReports() || [];
      const myReports = reports.filter(r => r.userId === session.userId);
      const reportsToday = myReports.filter(r => (Date.now() - (r.timestamp || r.createdAt)) < 86400000).length;
      
      let insightMsg = "";
      if (reportsToday === 0) insightMsg = "Submit progress to maintain streak 🔥";
      else if (reportsToday < 4) insightMsg = "You're on a roll! KEEP IT UP 🎉";
      else insightMsg = "Max efficiency! You're a machine 🤖";

      el.innerHTML = `
        <div style="display:flex; align-items:center; gap:20px;">
          <div class="insights-icon-glow">💡</div>
          <div style="flex:1">
            <h4 style="font-size:14px; margin-bottom:4px; font-family:var(--font-comic)">Smart Insights for You 🧠</h4>
            <div class="insights-text">
                ${points > 0 ? `You've earned <b>${points} points</b> today. You're ahead of <b>87% interns</b>! ✨` : 'Welcome!'} 
                ${insightMsg}
            </div>
          </div>
        </div>`;
    }
  }

  function animateCounters() {
    document.querySelectorAll('.counter-num').forEach(el => {
      const target = parseInt(el.dataset.target, 10) || 0;
      const prefix = el.parentElement.querySelector('.stat-prefix')?.textContent || '';
      const suffix = el.parentElement.querySelector('.stat-suffix')?.textContent || '';
      
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
