/**
 * InternTrack — Profile View (Redirect)
 * Routes to the correct role-based profile page.
 */

'use strict';

(() => {
  const session = Auth.requireAuth();
  if (!session) return;

  // Redirect to role-based profile page
  if (session.role === 'admin') {
    window.location.replace('admin-profile.html');
  } else {
    window.location.replace('student-profile.html');
  }

  // Topbar role badge
  const badge = document.getElementById('topbar-role-badge');
  if (badge) {
    badge.textContent = isAdmin ? 'Admin' : 'Intern';
    badge.className = `badge ${isAdmin ? 'badge-admin' : 'badge-user'}`;
  }

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());

  // ── Load and render profile ──
  const content = document.getElementById('profile-content');
  const loading = document.getElementById('profile-loading');

  setTimeout(() => {
    const p = Storage.getProfile(session.userId);
    loading.remove();
    if (!p) {
      content.innerHTML = `<div class="empty-state">
        <div class="empty-icon"><span class="material-symbols-outlined" style="font-size: 48px;">person_off</span></div>
        <div class="empty-title">Profile Not Found</div>
        <div class="empty-desc">The admin has not created your profile yet.</div>
      </div>`;
      return;
    }
    content.innerHTML = buildProfileHTML(p);
    initScrollReveal();
    initSkillHovers();
  }, 300);

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    } catch { return dateStr; }
  }

  function buildProfileHTML(p) {
    const intern = p.internship || {};
    const links = p.socialLinks || {};

    return `
      <!-- Hero -->
      <section class="profile-hero reveal" aria-label="Profile summary">
        <div class="hero-avatar" aria-label="${p.name} avatar">
          ${p.avatar
        ? `<img src="${p.avatar}" alt="${p.name} profile picture">`
        : (p.name || 'J')[0].toUpperCase()}
        </div>
        <div class="hero-body">
          <h1 class="hero-name">${p.name || 'Intern Name'}</h1>
          <p class="hero-tagline">${p.tagline || 'Software Engineering Intern'}</p>
          <div class="hero-meta" aria-label="Contact details">
            ${p.location ? `<span class="hero-meta-item">
              <span class="material-symbols-outlined" style="font-size: 14px;">location_on</span>
              ${p.location}
            </span>` : ''}
            ${p.email ? `<span class="hero-meta-item">
              <span class="material-symbols-outlined" style="font-size: 14px;">mail</span>
              ${p.email}
            </span>` : ''}
            ${intern.company ? `<span class="hero-meta-item">
              <span class="material-symbols-outlined" style="font-size: 14px;">domain</span>
              ${intern.company}
            </span>` : ''}
            ${links.github ? `<a class="hero-meta-item" href="${links.github}" target="_blank" rel="noopener" aria-label="GitHub profile">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
              GitHub
            </a>` : ''}
            ${links.linkedin ? `<a class="hero-meta-item" href="${links.linkedin}" target="_blank" rel="noopener" aria-label="LinkedIn profile">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              LinkedIn
            </a>` : ''}
          </div>

        </div>
        ${isAdmin ? `<a href="profile-builder.html" class="btn btn-secondary btn-sm" aria-label="Edit profile in builder"><span class="material-symbols-outlined" style="font-size: 16px;">edit</span> Edit Profile</a>` : ''}
      </section>

      <!-- Main grid -->
      <div class="container">
        <div class="profile-grid">
        <!-- Left column -->
        <div>
          <!-- Bio -->
          <section class="profile-section reveal anim-d1" aria-label="About">
            <div class="section-head">
              <div class="section-icon" style="background:rgba(79,124,255,.12)" aria-hidden="true"><span class="material-symbols-outlined" style="color:var(--clr-blue)">description</span></div>
              <h2 class="section-title">About</h2>
            </div>
            <div class="section-body">
              <p class="bio-text">${p.bio || 'No bio available yet. Ask the admin to add one.'}</p>
            </div>
          </section>

          <!-- Skills -->
          <section class="profile-section reveal anim-d2" aria-label="Skills">
            <div class="section-head">
              <div class="section-icon" style="background:rgba(34,211,238,.1)" aria-hidden="true"><span class="material-symbols-outlined" style="color:var(--clr-cyan)">bolt</span></div>
              <h2 class="section-title">Technical Skills</h2>
            </div>
            <div class="section-body">
              <div class="skills-cloud" role="list" aria-label="Skills list">
                ${(p.skills || []).length
        ? (p.skills || []).map(s => `<span class="skill-badge" role="listitem">${s}</span>`).join('')
        : '<span class="text-muted text-sm">No skills listed yet.</span>'
      }
              </div>
            </div>
          </section>

          <!-- Internship -->
          <section class="profile-section reveal anim-d3" aria-label="Internship experience">
            <div class="section-head">
              <div class="section-icon" style="background:rgba(168,85,247,.1)" aria-hidden="true"><span class="material-symbols-outlined" style="color:var(--clr-violet)">domain</span></div>
              <h2 class="section-title">Internship Experience</h2>
            </div>
            <div class="section-body">
              ${intern.company ? `
              <div class="timeline">
                <div class="timeline-item">
                  <div class="timeline-dot" aria-hidden="true"></div>
                  <div class="timeline-role">${intern.role || 'Intern'}</div>
                  <div class="timeline-company">${intern.company}</div>
                  <div class="timeline-dates">
                    ${formatDate(intern.startDate)} — ${intern.endDate ? formatDate(intern.endDate) : 'Present'}
                  </div>
                  <p class="timeline-desc">${intern.description || 'No description available.'}</p>
                  ${intern.technologies?.length ? `<div class="skills-cloud" style="margin-top:var(--sp-4)" aria-label="Technologies used">
                    ${intern.technologies.map(t => `<span class="skill-badge">${t}</span>`).join('')}
                  </div>` : ''}
                </div>
              </div>
              ` : '<p class="bio-text">No internship details added yet.</p>'}
            </div>
          </section>
        </div>

        <!-- Right sidebar -->
        <div>
          <section class="profile-section reveal anim-d2" aria-label="Contact information">
            <div class="section-head">
              <div class="section-icon" style="background:rgba(16,185,129,.1)" aria-hidden="true"><span class="material-symbols-outlined" style="color:var(--clr-success)">assignment</span></div>
              <h2 class="section-title">Details</h2>
            </div>
            <div class="section-body">
              <div class="info-list">
                <div class="info-row">
                  <div class="info-label">Full Name</div>
                  <div class="info-value">${p.name || '—'}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Email</div>
                  <div class="info-value"><a href="mailto:${p.email}">${p.email || '—'}</a></div>
                </div>
                <div class="info-row">
                  <div class="info-label">Location</div>
                  <div class="info-value">${p.location || '—'}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Current Role</div>
                  <div class="info-value">${intern.role || '—'}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Company</div>
                  <div class="info-value">${intern.company || '—'}</div>
                </div>
                <div class="divider" style="margin:var(--sp-3) 0"></div>
                <div class="info-row">
                  <div class="info-label">GitHub</div>
                  <div class="info-value">
                    ${links.github ? `<a href="${links.github}" target="_blank" rel="noopener">View Profile ↗</a>` : '—'}
                  </div>
                </div>
                <div class="info-row">
                  <div class="info-label">LinkedIn</div>
                  <div class="info-value">
                    ${links.linkedin ? `<a href="${links.linkedin}" target="_blank" rel="noopener">View Profile ↗</a>` : '—'}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- Projects shortcut -->
          <div class="profile-section reveal anim-d3" style="text-align:center;padding:var(--sp-6)">
            <div style="font-size:2rem;margin-bottom:var(--sp-3)" aria-hidden="true"><span class="material-symbols-outlined" style="font-size: 40px; color:var(--clr-blue)">folder</span></div>
            <div style="font-weight:var(--fw-semi);margin-bottom:var(--sp-2)">Project Portfolio</div>
            <div class="text-muted text-sm" style="margin-bottom:var(--sp-4)">Browse all ${Storage.getProjects().length} projects</div>
            <a href="projects.html" class="btn btn-primary btn-sm" style="width:100%">View Projects</a>
          </div>
        </div>
      </div>
    `;

  }

  // ── Intersection Observer scroll reveal ──
  function initScrollReveal() {
    const els = document.querySelectorAll('.reveal');
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    els.forEach(el => obs.observe(el));
  }

  function initSkillHovers() {
    // Skill badges are already handled with CSS :hover
  }

  // ── Shared sidebar builder ──
  function setupSidebar(session, activePage) {
    const nav = document.getElementById('sidebar-nav');
    const avatar = document.getElementById('user-avatar-sidebar');
    const nameEl = document.getElementById('user-name-sidebar');
    const roleEl = document.getElementById('user-role-sidebar');

    const isAdmin = session.role === 'admin';
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

    const items = [
      { label: 'Dashboard', href: 'dashboard.html', icon: 'grid_view' },
      { label: 'My Profile', href: session.role === 'admin' ? 'admin-profile.html' : 'profile-view.html', icon: 'person' },
      ...(session.role === 'admin' ? [{ label: 'Interns', href: 'students.html', icon: 'group' }] : []),
      { label: 'Projects', href: 'projects.html', icon: 'folder' },
    ];

    if (nav) {
      nav.innerHTML = '<div class="nav-section-label">Menu</div>' +
        items.map(item => `
          <a class="nav-item${item.href === activePage ? ' active' : ''}" href="${item.href}" aria-current="${item.href === activePage ? 'page' : 'false'}">
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

})();
