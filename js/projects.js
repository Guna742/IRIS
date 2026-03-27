/**
 * InternTrack — Projects Showcase Logic
 * Admin: Add/delete projects via modal. Users: view only.
 * Stagger card load, screenshot Base64 upload, permission guard.
 */

'use strict';

(() => {
    const session = Auth.requireAuth();
    if (!session) return;

    if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
        Storage.fetchEverything();
    }

    const isAdmin = session.role === 'admin';
    const isUser = session.role === 'user';
    
    if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
        Storage.fetchEverything();
    }
    
    setupSidebar(session, 'projects.html');

    // ── Topbar ──
    const badge = document.getElementById('topbar-role-badge');
    badge.textContent = isAdmin ? 'Admin' : 'Intern';
    badge.className = `badge ${isAdmin ? 'badge-admin' : 'badge-user'}`;

    document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());

    // ── UI visibility (Add project only for Interns/Users) ──
    if (isUser) {
        document.getElementById('fab-btn').style.display = 'flex';
        document.getElementById('add-btn-top').style.display = 'flex';
    } else {
        document.getElementById('no-permission-tip').style.display = 'block';
        document.getElementById('no-permission-tip').textContent = 'Admin Mode: Rate intern projects to influence their performance scores.';
    }

    // ── Render projects ──
    const grid = document.getElementById('projects-grid');
    const countLabel = document.getElementById('project-count-label');

    function renderProjects() {
        const projects = Storage.getProjects();
        countLabel.textContent = `${projects.length} project${projects.length !== 1 ? 's' : ''} in portfolio`;

        if (projects.length === 0) {
            grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon" aria-hidden="true"><span class="material-symbols-outlined" style="font-size: 48px;">folder_off</span></div>
          <div class="empty-title">No projects yet</div>
          <div class="empty-desc">
            ${isUser
                    ? 'Add your first project using the + button below.'
                    : 'The interns have not added any projects yet.'}
          </div>
          ${isUser ? `<button class="btn btn-primary" onclick="document.getElementById('fab-btn').click()">Add First Project</button>` : ''}
        </div>`;
            return;
        }

        grid.innerHTML = projects.map((p, i) => buildCard(p, i)).join('');

        // Attach user card actions (Interns manage their own projects)
        if (isUser) {
            grid.querySelectorAll('[data-delete]').forEach(btn => {
                btn.addEventListener('click', () => handleDelete(btn.dataset.delete, btn.dataset.title));
            });
            grid.querySelectorAll('[data-edit]').forEach(btn => {
                btn.addEventListener('click', () => openModal(btn.dataset.edit));
            });
        }

        // Attach rating handlers for admins
        if (isAdmin) {
            grid.querySelectorAll('.star-rating .star').forEach(star => {
                star.addEventListener('click', (e) => {
                    const rating = parseInt(star.dataset.value);
                    const projId = star.closest('.project-card').id;
                    handleRate(projId, rating);
                });
            });
        }
    }

    function buildCard(p, index) {
        const delayClass = `anim-d${Math.min(index + 1, 8)}`;
        const displayDate = p.createdAt
            ? new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '';

        // Resolve owner name: stored on project, or look up from profiles
        let ownerName = p.ownerName || '';
        if (!ownerName && p.ownerId) {
            const ownerProfile = Storage.getProfile(p.ownerId);
            ownerName = ownerProfile ? ownerProfile.name : '';
        }

        return `
      <article class="project-card ${delayClass}" id="${p.id}" aria-label="Project: ${p.title}">
        <div class="card-img-wrap">
          ${p.screenshot
                ? `<img class="card-img" src="${p.screenshot}" alt="${p.title} screenshot" loading="lazy">`
                : `<div class="card-img-placeholder">
                <span class="ph-icon" aria-hidden="true"><span class="material-symbols-outlined" style="font-size: 48px;">folder</span></span>
                <span class="ph-title">${p.techStack?.[0] || 'Project'}</span>
              </div>`}
          ${p.status ? `<span class="card-status-badge ${p.status.toLowerCase()}">${p.status}</span>` : ''}
          ${displayDate ? `<span class="card-date">${displayDate}</span>` : ''}
        </div>
        <div class="card-body">
          <h2 class="card-title">${p.title}</h2>
          <p class="card-desc">${p.description}</p>
          <div class="card-stack" aria-label="Technologies used">
            ${(p.techStack || []).map(t => `<span class="stack-tag">${t}</span>`).join('')}
          </div>
        </div>
        <div class="card-footer">
          <div class="card-links">
            ${p.githubLink
                ? `<a class="card-link github" href="${p.githubLink}" target="_blank" rel="noopener" aria-label="GitHub for ${p.title}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                  GitHub
                </a>`
                : ''}
            ${p.liveLink
                ? `<a class="card-link live" href="${p.liveLink}" target="_blank" rel="noopener" aria-label="${p.liveLinkType === 'Demo' ? 'Demo' : 'Live demo'} for ${p.title}">
                  <span class="material-symbols-outlined" style="font-size: 14px;">open_in_new</span>
                  ${p.liveLinkType === 'Demo' ? 'Demo URL' : 'Live Demo'}
                </a>`
                : ''}
          </div>
          ${isUser ? `
          <div class="card-actions">
            <button class="btn btn-icon btn-sm" data-edit="${p.id}" title="Edit project" aria-label="Edit ${p.title}">
              <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
            </button>
            <button class="btn btn-icon btn-sm" data-delete="${p.id}" data-title="${p.title}" title="Delete project" aria-label="Delete ${p.title}">
              <span class="material-symbols-outlined" style="font-size: 18px; color:var(--clr-danger)">delete</span>
            </button>
          </div>` : isAdmin ? `
          <div class="card-rating-zone">
            <span class="rating-label">Rate Project:</span>
            <div class="star-rating" data-id="${p.id}">
                ${[1, 2, 3, 4, 5].map(v => `
                    <span class="star ${p.rating >= v ? 'active' : ''}" data-value="${v}" role="button" aria-label="Rate ${v} stars">${p.rating >= v ? '★' : '☆'}</span>
                `).join('')}
            </div>
          </div>
          ` : p.rating ? `
          <div class="card-rating-display">
            <div class="stars active">${'★'.repeat(p.rating)}${'☆'.repeat(5 - p.rating)}</div>
          </div>
          ` : ''}
        </div>
        <!-- Student owner name -->
        <div class="card-owner" aria-label="Project by ${ownerName || 'Unknown'}">
          <span class="card-owner-icon" aria-hidden="true"><span class="material-symbols-outlined" style="font-size: 14px;">person</span></span>
          <span class="card-owner-name">${ownerName || 'Unassigned'}</span>
        </div>
      </article>`;
    }

    // ── Rating ──
    function handleRate(id, rating) {
        const p = Storage.getProjectById(id);
        if (!p) return;
        p.rating = rating;
        const updated = Storage.saveProject(p);
        // Sync rating to Firestore
        if (Storage.syncProject) Storage.syncProject(updated || p);
        showToast(`Project rated ${rating}/5`, 'success');
        renderProjects();
    }

    // ── Delete ──
    async function handleDelete(id, title) {
        if (!(await IrisModal.confirm(`Delete "${title}"? This cannot be undone.`, 'Confirm Deletion', true))) return;
        Storage.deleteProject(id);
        // Sync deletion to Firestore
        if (Storage.deleteProjectFromFirebase) Storage.deleteProjectFromFirebase(id);
        showToast(`"${title}" deleted.`, 'info');
        renderProjects();
    }

    // ── Modal state ──
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalSave = document.getElementById('modal-save');
    const modalClose = document.getElementById('modal-close');
    const modalCancel = document.getElementById('modal-cancel');

    // Form fields
    const projTitle = document.getElementById('proj-title');
    const projDesc = document.getElementById('proj-desc');
    const projGithub = document.getElementById('proj-github');
    const projLive = document.getElementById('proj-live');
    const stackInput = document.getElementById('proj-stack-input');
    const stackTagsList = document.getElementById('stack-tags-list');
    const screenshotFile = document.getElementById('proj-screenshot');
    const screenshotDrop = document.getElementById('screenshot-drop');
    const screenshotPrev = document.getElementById('screenshot-preview-wrap');
    const screenshotImg = document.getElementById('screenshot-preview-img');
    const screenshotReset = document.getElementById('screenshot-reset');
    const projStatus = document.getElementById('proj-status');

    let stackTags = [];
    let screenshotB64 = '';
    let editingId = null;

    function resetModal() {
        projTitle.value = '';
        projDesc.value = '';
        projGithub.value = '';
        projLive.value = '';
        const linkTypeEl = document.getElementById('proj-link-type');
        if (linkTypeEl) {
            linkTypeEl.value = 'Live';
            linkTypeEl.dispatchEvent(new Event('change'));
        }
        stackTags = [];
        renderStackTags();
        clearScreenshot();
        projStatus.value = 'Ongoing';
        editingId = null;
    }

    function openModal(editId = null) {
        if (!isUser) { shakeNoPermission(); return; }
        resetModal();

        if (editId) {
            const p = Storage.getProjectById(editId);
            if (!p) return;
            editingId = editId;
            projTitle.value = p.title;
            projDesc.value = p.description;
            projGithub.value = p.githubLink || '';
            projLive.value = p.liveLink || '';
            const linkTypeEl = document.getElementById('proj-link-type');
            if (linkTypeEl) {
                linkTypeEl.value = p.liveLinkType || 'Live';
                linkTypeEl.dispatchEvent(new Event('change'));
            }
            stackTags = [...(p.techStack || [])];
            renderStackTags();
            if (p.screenshot) {
                screenshotB64 = p.screenshot;
                screenshotImg.src = p.screenshot;
                screenshotPrev.style.display = 'block';
                document.getElementById('screenshot-placeholder').style.display = 'none';
            }
            projStatus.value = p.status || 'Ongoing';
            modalTitle.textContent = 'Edit Project';
        } else {
            modalTitle.textContent = 'Add New Project';
        }

        modalOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
        setTimeout(() => projTitle.focus(), 200);
    }

    function closeModal() {
        modalOverlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    // ── Stack tag input ──
    function renderStackTags() {
        stackTagsList.innerHTML = stackTags.map((t, i) => `
      <span class="tag-chip">
        ${t}
        <button class="tag-chip-remove" data-idx="${i}" aria-label="Remove ${t}" type="button">
          <span class="material-symbols-outlined" style="font-size: 12px;">close</span>
        </button>
      </span>
    `).join('');
        stackTagsList.querySelectorAll('.tag-chip-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                stackTags.splice(parseInt(btn.dataset.idx, 10), 1);
                renderStackTags();
            });
        });
    }

    stackInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const v = stackInput.value.trim().replace(/,$/, '');
            if (v && !stackTags.includes(v)) { stackTags.push(v); renderStackTags(); }
            stackInput.value = '';
        }
        if (e.key === 'Backspace' && !stackInput.value && stackTags.length) {
            stackTags.pop(); renderStackTags();
        }
    });
    stackInput.addEventListener('blur', () => {
        const v = stackInput.value.trim().replace(/,$/, '');
        if (v && !stackTags.includes(v)) { stackTags.push(v); renderStackTags(); }
        stackInput.value = '';
    });
    document.getElementById('stack-wrap').addEventListener('click', () => stackInput.focus());

    // ── Screenshot ──
    function setScreenshot(file) {
        if (!file) return;
        if (file.size > 3 * 1024 * 1024) { showToast('Image too large. Max 3MB.', 'error'); return; }
        const reader = new FileReader();
        reader.onload = ev => {
            screenshotB64 = ev.target.result;
            screenshotImg.src = screenshotB64;
            screenshotPrev.style.display = 'block';
            document.getElementById('screenshot-placeholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
    }
    function clearScreenshot() {
        screenshotB64 = '';
        screenshotImg.src = '';
        screenshotPrev.style.display = 'none';
        document.getElementById('screenshot-placeholder').style.display = 'block';
        screenshotFile.value = '';
    }

    screenshotFile.addEventListener('change', e => setScreenshot(e.target.files[0]));
    screenshotDrop.addEventListener('dragover', e => { e.preventDefault(); screenshotDrop.classList.add('drag-over'); });
    screenshotDrop.addEventListener('dragleave', () => screenshotDrop.classList.remove('drag-over'));
    screenshotDrop.addEventListener('drop', e => {
        e.preventDefault();
        screenshotDrop.classList.remove('drag-over');
        setScreenshot(e.dataTransfer.files[0]);
    });
    screenshotReset.addEventListener('click', clearScreenshot);

    // ── Save ──
    modalSave.addEventListener('click', () => {
        const title = projTitle.value.trim();
        const desc = projDesc.value.trim();

        if (!title) { projTitle.focus(); projTitle.classList.add('anim-shake'); setTimeout(() => projTitle.classList.remove('anim-shake'), 600); showToast('Project title is required.', 'error'); return; }
        if (!desc) { projDesc.focus(); projDesc.classList.add('anim-shake'); setTimeout(() => projDesc.classList.remove('anim-shake'), 600); showToast('Description is required.', 'error'); return; }

        const project = {
            id: editingId || null,
            title,
            description: desc,
            techStack: [...stackTags],
            status: projStatus.value,
            githubLink: projGithub.value.trim() || '',
            liveLink: projLive.value.trim() || '',
            liveLinkType: document.getElementById('proj-link-type') ? document.getElementById('proj-link-type').value : 'Live',
            screenshot: screenshotB64 || '',
            ownerId: isUser ? session.userId : null,
            ownerName: isUser ? session.name : null,
            createdAt: editingId ? Storage.getProjectById(editingId).createdAt : Date.now()
        };

        const saved = Storage.saveProject(project);
        // Sync project to Firestore
        if (Storage.syncProject) Storage.syncProject(saved || project);
        closeModal();
        renderProjects();
        showToast(editingId ? 'Project updated!' : 'Project added!', 'success');
    });

    // ── Modal events ──
    [modalClose, modalCancel].forEach(el => el.addEventListener('click', closeModal));
    modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalOverlay.classList.contains('open')) closeModal(); });

    // Open modal buttons
    document.getElementById('fab-btn').addEventListener('click', () => openModal());
    document.getElementById('add-btn-top').addEventListener('click', () => openModal());

    // ── Permission denied (shake for non-admins clicking protected areas) ──
    function shakeNoPermission() {
        const tip = document.getElementById('no-permission-tip');
        tip.classList.remove('anim-shake');
        void tip.offsetWidth;
        tip.classList.add('anim-shake');
        setTimeout(() => tip.classList.remove('anim-shake'), 600);
    }

    // ── Init render ──
    renderProjects();

    // ── Hash-based scroll & highlight (from students page links) ──
    function handleHashHighlight() {
        const hash = window.location.hash.slice(1); // e.g. "proj_1"
        if (!hash) return;
        const target = document.getElementById(hash);
        if (!target) return;
        // Smooth scroll after a short delay so cards have rendered
        setTimeout(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add('card-highlight');
            setTimeout(() => target.classList.remove('card-highlight'), 2200);
        }, 350);
    }
    handleHashHighlight();

    // ── Toast ──
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const icons = { success: 'check_circle', error: 'error', info: 'info' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span class="toast-icon material-symbols-outlined" aria-hidden="true">${icons[type] || 'info'}</span><span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'all .3s ease';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => toast.remove(), 350);
        }, 3200);
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
            { label: 'My Profile', href: isAdmin ? 'admin-profile.html' : 'student-profile.html', icon: 'person' },
            ...(isAdmin
                ? [{ label: 'Interns', href: 'students.html', icon: 'group' }]
                : [
                    { label: 'Leaderboard', href: 'leaderboard.html', icon: 'leaderboard' },
                    { label: 'My Analytics', href: `student-analytics.html?student=${session.userId}`, icon: 'analytics' }
                ]
            ),
            { label: 'Projects', href: 'projects.html', icon: 'folder', active: true },
            { label: 'Doubts', href: 'doubts.html', icon: 'help_center' },
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
