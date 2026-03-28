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

      if (userAvatarSb) {
        if (currentAvatar) {
          userAvatarSb.innerHTML = `<img src="${currentAvatar}" alt="${currentName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        } else {
          userAvatarSb.textContent = currentName[0].toUpperCase();
        }
      }
      if (userNameSb) userNameSb.textContent = currentName;
      if (userRoleSb) userRoleSb.textContent = isAdmin ? (adminProfile?.roleTitle || 'Administrator') : 'Intern';
      
      if (welcomeTitle) {
          welcomeTitle.innerHTML = `<span class="anim-title"><span>Welcome back, ${currentName}!</span></span>`;
      }

      // 3. Components
      renderStats(projects, allProfiles, profile);
      renderActions();
      renderRecentProjects(projects);
      if (isAdmin) renderRecentReports(allProfiles);

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
        { label: 'Total Projects', value: projects.length, icon: 'folder', color: '#8b5cf6', trend: '+2 this week', clickable: true, href: 'projects.html' },
        { label: 'Interns', value: totalInterns, icon: 'group', color: '#22d3ee', trend: 'Active', clickable: true, href: 'students.html' },
        { label: 'Avg Skills', value: avgSkills, icon: 'bolt', color: '#a855f7', trend: 'Growing' },
        { label: 'Completion', value: completionRate, suffix: '%', icon: 'task_alt', color: '#10b981', trend: '+5% week' },
      ];
    } else {
      const myProjects = projects.filter(p => (p.userId || p.ownerId) === session.userId).length;
      const teamSize = allProfiles.filter(p => p.internship?.company && p.internship.company === profile?.internship?.company).length;
      
      const totalDays = 156;
      let daysLeft = totalDays;
      if (profile && profile.createdAt) {
        const elapsed = Math.floor((Date.now() - profile.createdAt) / (1000 * 60 * 60 * 24));
        daysLeft = Math.max(0, totalDays - elapsed);
      }

      statsData = [
        { label: 'My Projects', value: myProjects, icon: 'folder', color: '#8b5cf6', trend: 'Active', clickable: true, href: 'projects.html' },
        { label: 'Skills', value: profile.skills?.length || 0, icon: 'bolt', color: '#22d3ee', trend: 'Listed' },
        { label: 'My Team', value: Math.max(1, teamSize), icon: 'group_work', color: '#a855f7', trend: 'Collaborators' },
        { label: 'Days Left', value: daysLeft, icon: 'calendar_month', color: '#10b981', trend: 'On track' },
      ];
    }

    statsGrid.innerHTML = statsData.map((s, i) => `
      <div class="stat-card reveal anim-d${i + 1} card-3d ${s.clickable ? 'clickable-stat' : ''}" 
           ${s.clickable ? `onclick="window.location.href='${s.href}'"` : ''}>
        <div class="glare" aria-hidden="true"></div>
        <div class="stat-card-head">
            <div class="stat-card-label">${s.label}</div>
            <div class="stat-card-icon" style="background:${s.color}20">
              <span class="material-symbols-outlined" style="color:${s.color}">${s.icon}</span>
            </div>
        </div>
        <div class="stat-card-value">
          <span class="counter-num" data-target="${s.value}">${s.value}</span>
          ${s.suffix ? `<span class="stat-suffix">${s.suffix}</span>` : ''}
        </div>
        <div class="stat-card-trend up">
          ${arrowUp()}
          <span class="trend-text">${s.trend}</span>
        </div>
        ${sparklineSVG(s.color)}
      </div>
    `).join('');
  }

  function renderActions() {
    if (!quickActions) return;
    const actions = isAdmin ? [
      { label: 'My Profile', desc: 'Admin profile & stats', href: 'admin-profile.html', icon: 'person', color: 'rgba(245,158,11,.1)' },
      { label: 'Create Intern', desc: 'Add new intern profile', href: 'profile-builder.html?action=new-intern', icon: 'person_add', color: 'rgba(79,124,255,.12)' },
      { label: 'Intern Directory', desc: 'View intern details', href: 'students.html', icon: 'school', color: 'rgba(34,211,238,.1)' },
    ] : [
      { label: 'My Profile', desc: 'View your portfolio', href: 'student-profile.html', icon: 'person', color: 'rgba(34,211,238,.08)' },
      { label: 'My Analytics', desc: 'Track your performance', href: `student-analytics.html?student=${session.userId}`, icon: 'analytics', color: 'rgba(139,92,246,.12)' },
      { label: 'Projects', desc: 'Browse all projects', href: 'projects.html', icon: 'folder', color: 'rgba(79,124,255,.12)' },
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
      recentProjList.innerHTML = `<p class="text-muted text-sm" style="padding: 20px 0">No projects built yet.</p>`;
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
    if (!list) return;

    const reports = Storage.getHourlyReports() || [];
    if (reports.length === 0) {
      list.innerHTML = `<p class="text-muted" style="padding: 20px 0">No activity reports found.</p>`;
      return;
    }
    document.getElementById('reports-card').style.display = 'block';
    
    reports.sort((a,b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0)).slice(0, 5).forEach((r, i) => {
      const p = allProfiles.find(prof => prof.userId === r.userId) || { name: 'Unknown' };
      list.innerHTML += `
        <div class="proj-item visible card-3d" style="padding: 8px 12px; margin-bottom: 8px; transition-delay: ${i * 0.05}s">
          <div class="glare" aria-hidden="true"></div>
          <div class="proj-info" style="margin:0">
            <div style="font-weight:600; font-size:14px; color: var(--clr-text-main)">${p.name}</div>
            <div style="font-size:12px; color:var(--clr-text-muted)">Slot ${r.window}:00 — ${r.task || 'Activity'}</div>
          </div>
        </div>
      `;
    });
  }

  function animateCounters() {
    document.querySelectorAll('.counter-num').forEach(el => {
      const target = parseInt(el.dataset.target, 10) || 0;
      if (target === 0) { el.textContent = '0'; return; }
      const duration = 1500;
      const start = performance.now();
      const step = now => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - (1 - progress) ** 4;
        el.textContent = Math.floor(eased * target);
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
