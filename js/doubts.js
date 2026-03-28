/**
 * I.R.I.S — Doubts List Page Logic (Role-Gated)
 * INTERN  → can ask questions (see "Ask a Doubt" button), can vote, can mark resolved.
 * ADMIN   → read-only on this page; answers from doubt-detail.html.
 *           "Ask a Doubt" button is hidden for admins.
 *           Admin tab shows ALL questions (no "My Questions" tab).
 * Requires: firebase-config.js, auth.js, badge-engine.js, storage.js
 */

'use strict';

// ── Feature Flags ──
// Set to true once Firebase Storage plan is upgraded to enable image uploads.
const IMAGE_UPLOAD_ENABLED = false;


(() => {
    // ── Auth Guard ──
    const session = Auth.requireAuth();
    if (!session) return;

    if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
        Storage.fetchEverything();
    }

    const isAdmin = session.role === 'admin';

    // ── DOM refs ──
    const sidebarNav       = document.getElementById('sidebar-nav');
    const userAvatarSb     = document.getElementById('user-avatar-sidebar');
    const userNameSb       = document.getElementById('user-name-sidebar');
    const userRoleSb       = document.getElementById('user-role-sidebar');
    const topbarBadge      = document.getElementById('topbar-role-badge');
    const logoutBtn        = document.getElementById('logout-btn');
    const hamburgerBtn     = document.getElementById('hamburger-btn');
    const appSidebar       = document.getElementById('app-sidebar');
    const sidebarOverlay   = document.getElementById('sidebar-overlay');
    const doubtsList       = document.getElementById('doubts-list');
    const askDoubtBtn      = document.getElementById('ask-doubt-btn');
    const askModal         = document.getElementById('ask-modal');
    const modalCloseBtn    = document.getElementById('modal-close-btn');
    const modalCancelBtn   = document.getElementById('modal-cancel-btn');
    const askForm          = document.getElementById('ask-form');
    const askSubmitBtn     = document.getElementById('ask-submit-btn');
    const uploadArea       = document.getElementById('upload-area');
    const uploadInput      = document.getElementById('doubt-image');
    const uploadPreview    = document.getElementById('upload-preview');
    const uploadPreviewImg = document.getElementById('upload-preview-img');
    const lightbox         = document.getElementById('lightbox');
    const lightboxImg      = document.getElementById('lightbox-img');
    const mineTabBtn       = document.getElementById('tab-mine');
    const mineCountEl      = document.getElementById('count-mine');

    // ── Role-based UI adjustments ──
    // Hide "Ask a Doubt" button completely for admins
    if (isAdmin && askDoubtBtn) {
        askDoubtBtn.style.display = 'none';
    }

    // Hide "My Questions" tab for admins (they don't ask questions)
    if (isAdmin && mineTabBtn) {
        mineTabBtn.style.display = 'none';
    }

    // Change page subtitle based on role
    const subtitleEl = document.querySelector('.doubts-header-text .page-subtitle');
    if (subtitleEl) {
        subtitleEl.textContent = isAdmin
            ? 'Review intern messages and provide clear, helpful answers.'
            : 'Post messages, get answers from your admin, and clear the wall.';
    }

    // ── Populate sidebar user info ──
    const profile = isAdmin
        ? (Storage.getAdminProfile ? Storage.getAdminProfile(session.userId) : null)
        : Storage.getProfile(session.userId);
    const currentName = profile?.name || session.displayName;

    if (userAvatarSb) userAvatarSb.textContent = currentName[0].toUpperCase();
    if (userNameSb)   userNameSb.textContent = currentName;
    if (userRoleSb)   userRoleSb.textContent = isAdmin ? 'Administrator' : 'Intern';
    if (topbarBadge) {
        topbarBadge.textContent = isAdmin ? 'Admin' : 'Intern';
        topbarBadge.className   = `badge ${isAdmin ? 'badge-admin' : 'badge-user'}`;
    }

    // ── Build Sidebar Nav ──
    const NAV_INTERN = [
        { label: 'Dashboard',    href: 'dashboard.html',    icon: 'grid_view' },
        { label: 'My Profile',   href: 'student-profile.html', icon: 'person' },
        { label: 'Leaderboard',  href: 'leaderboard.html',  icon: 'leaderboard' },
        { label: 'My Analytics', href: `student-analytics.html?student=${session.userId}`, icon: 'analytics' },
        { label: 'Report Submission', href: 'report-submission.html', icon: 'description' },
        { label: 'Projects',     href: 'projects.html',     icon: 'folder' },
        { label: 'The Wall',     href: 'doubts.html',       icon: 'chat', active: true },
    ];
    const NAV_ADMIN = [
        { label: 'Dashboard',    href: 'dashboard.html',    icon: 'grid_view' },
        { label: 'My Profile',   href: 'admin-profile.html', icon: 'person' },
        { label: 'Interns',      href: 'students.html',     icon: 'group' },
        { label: 'Projects',     href: 'projects.html',     icon: 'folder' },
        { label: 'The Wall',     href: 'doubts.html',       icon: 'chat', active: true },
    ];
    const navItems = isAdmin ? NAV_ADMIN : NAV_INTERN;

    if (sidebarNav) {
        sidebarNav.innerHTML = '<div class="nav-section-label">Menu</div>' +
            navItems.map(item => `
                <a class="nav-item${item.active ? ' active' : ''}" href="${item.href}"
                   aria-current="${item.active ? 'page' : 'false'}">
                    <span class="nav-icon" aria-hidden="true">
                        <span class="material-symbols-outlined">${item.icon}</span>
                    </span>
                    <span>${item.label}</span>
                </a>`).join('');
    }

    // ── Sidebar Mobile Toggle ──
    if (hamburgerBtn && appSidebar && sidebarOverlay) {
        hamburgerBtn.addEventListener('click', () => {
            const open = appSidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('visible', open);
            hamburgerBtn.setAttribute('aria-expanded', String(open));
        });
        sidebarOverlay.addEventListener('click', () => {
            appSidebar.classList.remove('open');
            sidebarOverlay.classList.remove('visible');
            hamburgerBtn.setAttribute('aria-expanded', 'false');
        });
    }

    logoutBtn?.addEventListener('click', () => Auth.logout());

    // ── Toast ──
    function showToast(msg, type = 'info') {
        const tc = document.getElementById('toast-container');
        if (!tc) return;
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';
        t.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px">${icon}</span><span>${msg}</span>`;
        tc.appendChild(t);
        setTimeout(() => {
            t.classList.add('exiting');
            setTimeout(() => t.remove(), 350);
        }, 3500);
    }

    // ── Newbie Badge (interns only) ──
    if (!isAdmin) {
        BadgeEngine.ensureNewbieBadge(session.userId);
    }

    // ── State ──
    let allQuestions   = [];
    let activeTab      = 'all';
    let selectedFile   = null;

    // ── Firestore Listener ──
    let unsubscribe = null;
    function startListener() {
        if (unsubscribe) unsubscribe();
        unsubscribe = fbDb.collection('questions')
            .orderBy('createdAt', 'desc')
            .onSnapshot(snapshot => {
                allQuestions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                updateTabCounts();
                renderList();
            }, err => {
                console.error('[Doubts] Snapshot error:', err);
                doubtsList.innerHTML = `
                    <div class="doubts-empty">
                        <div class="doubts-empty-icon"><span class="material-symbols-outlined" style="font-size:48px">wifi_off</span></div>
                        <div class="doubts-empty-title">Failed to load questions</div>
                        <div class="doubts-empty-sub">Check your connection and try refreshing.</div>
                    </div>`;
            });
    }
    startListener();

    // ── Tab Counts ──
    function updateTabCounts() {
        const el = id => document.getElementById(id);
        el('count-all').textContent      = allQuestions.length;
        el('count-open').textContent     = allQuestions.filter(q => q.status !== 'resolved').length;
        el('count-resolved').textContent = allQuestions.filter(q => q.status === 'resolved').length;
        if (!isAdmin && mineCountEl) {
            mineCountEl.textContent = allQuestions.filter(q => q.userId === session.userId).length;
        }
    }

    // ── Filter ──
    function getFiltered() {
        switch (activeTab) {
            case 'open':     return allQuestions.filter(q => q.status !== 'resolved');
            case 'resolved': return allQuestions.filter(q => q.status === 'resolved');
            case 'mine':     return isAdmin ? allQuestions : allQuestions.filter(q => q.userId === session.userId);
            default:         return allQuestions;
        }
    }

    // ── Render ──
    function renderList() {
        const filtered = getFiltered();

        if (filtered.length === 0) {
            const emptyMsg = activeTab === 'mine'
                ? "You haven't asked any questions yet."
                : isAdmin
                    ? 'No intern questions yet. Check back soon!'
                    : 'No questions yet. Be the first to ask!';
            doubtsList.innerHTML = `
                <div class="doubts-empty">
                    <div class="doubts-empty-icon"><span class="material-symbols-outlined" style="font-size:48px">quiz</span></div>
                    <div class="doubts-empty-title">No questions here</div>
                    <div class="doubts-empty-sub">${emptyMsg}</div>
                </div>`;
            return;
        }

        doubtsList.innerHTML = filtered.map(q => renderCard(q)).join('');

        doubtsList.querySelectorAll('.doubt-card').forEach(card => {
            const id = card.dataset.id;
            card.addEventListener('click', () => {
                window.location.href = `doubt-detail.html?id=${id}`;
            });
            card.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') window.location.href = `doubt-detail.html?id=${id}`;
            });
        });
    }

    function renderCard(q) {
        const isResolved  = q.status === 'resolved';
        const answerCount = q.answerCount || 0;
        const votes       = q.votes || 0;
        const views       = q.views || 0;
        const time        = formatTime(q.createdAt?.toDate ? q.createdAt.toDate() : new Date(q.createdAt));
        const isOwnQ      = q.userId === session.userId;

        return `
        <div class="doubt-card ${isResolved ? 'resolved' : ''}" data-id="${q.id}" role="listitem" tabindex="0" aria-label="${escHtml(q.title)}">
            <div class="doubt-card-top">
                <div class="doubt-vote-col" aria-label="${votes} votes">
                    <div class="doubt-vote-count">${votes}</div>
                    <div class="doubt-vote-label">votes</div>
                </div>
                <div class="doubt-card-body">
                    <div class="doubt-card-title">${escHtml(q.title)}</div>
                    <div class="doubt-card-desc">${escHtml(q.description || '')}</div>
                    <div class="doubt-card-meta">
                        <span class="status-badge ${isResolved ? 'resolved' : 'open'}">
                            <span class="material-symbols-outlined" style="font-size:12px">
                                ${isResolved ? 'check_circle' : 'radio_button_unchecked'}
                            </span>
                            ${isResolved ? 'Resolved' : 'Open'}
                        </span>
                        <span class="doubt-answer-count ${answerCount > 0 ? 'has-answers' : ''}">
                            <span class="material-symbols-outlined" style="font-size:12px">forum</span>
                            ${answerCount} ${answerCount === 1 ? 'answer' : 'answers'}
                        </span>
                        <span class="doubt-meta-item">
                            <span class="material-symbols-outlined">visibility</span>
                            ${views}
                        </span>
                        <span class="doubt-meta-item">
                            <span class="material-symbols-outlined">schedule</span>
                            ${time}
                        </span>
                        ${isOwnQ ? `<span class="status-badge" style="background:rgba(34,211,238,.1);color:var(--clr-cyan);border-color:rgba(34,211,238,.2)">
                            <span class="material-symbols-outlined" style="font-size:12px">person</span>You
                        </span>` : ''}
                        ${isAdmin ? `<span class="doubt-meta-item" style="color:var(--clr-text-muted);font-style:italic">
                            by ${escHtml(q.authorName || 'Intern')}
                        </span>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
    }

    // ── Tab Switching ──
    document.querySelectorAll('.doubt-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.doubt-tab').forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            activeTab = tab.dataset.tab;
            renderList();
        });
    });

    // ── Ask Modal (INTERN only) ──
    if (!isAdmin) {
        function openModal() {
            askModal.classList.add('open');
            document.body.style.overflow = 'hidden';
            document.getElementById('doubt-title').focus();
        }

        function closeModal() {
            askModal.classList.remove('open');
            document.body.style.overflow = '';
            askForm.reset();
            selectedFile = null;
            if (uploadPreview) uploadPreview.classList.remove('visible');
            if (uploadPreviewImg) uploadPreviewImg.src = '';
        }

        askDoubtBtn?.addEventListener('click', openModal);
        modalCloseBtn?.addEventListener('click', closeModal);
        modalCancelBtn?.addEventListener('click', closeModal);
        askModal?.addEventListener('click', e => { if (e.target === askModal) closeModal(); });

        // Image preview
        uploadInput?.addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5MB.', 'error'); return; }
            selectedFile = file;
            const reader = new FileReader();
            reader.onload = ev => {
                if (uploadPreviewImg) uploadPreviewImg.src = ev.target.result;
                if (uploadPreview) uploadPreview.classList.add('visible');
            };
            reader.readAsDataURL(file);
        });

        uploadArea?.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
        uploadArea?.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
        uploadArea?.addEventListener('drop', e => { e.preventDefault(); uploadArea.classList.remove('drag-over'); });

        // Submit
        askForm?.addEventListener('submit', async e => {
            e.preventDefault();
            const title = document.getElementById('doubt-title').value.trim();
            const desc  = document.getElementById('doubt-desc').value.trim();
            const link  = document.getElementById('doubt-link').value.trim();

            if (!title) { showToast('Please enter a title.', 'error'); return; }
            if (!desc)  { showToast('Please add a description.', 'error'); return; }

            askSubmitBtn.disabled = true;
            askSubmitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;animation:spin 1s linear infinite">progress_activity</span> Posting...';

            let imageUrl = '';
            try {
                // Image upload is disabled until Storage plan is upgraded.
                // To re-enable: set IMAGE_UPLOAD_ENABLED = true at the top of this file.
                if (IMAGE_UPLOAD_ENABLED && selectedFile) {
                    const ref = firebase.storage().ref(`doubt-images/${session.userId}/${Date.now()}_${selectedFile.name}`);
                    const snap = await ref.put(selectedFile);
                    imageUrl = await snap.ref.getDownloadURL();
                }

                await fbDb.collection('questions').add({
                    userId:          session.userId,
                    authorName:      currentName,
                    title,
                    description:     desc,
                    linkUrl:         link || '',
                    imageUrl:        imageUrl || '',
                    votes:           0,
                    views:           0,
                    answerCount:     0,
                    acceptedAnswerId: null,
                    status:          'open',
                    createdAt:       firebase.firestore.FieldValue.serverTimestamp()
                });

                const { newBadges } = await BadgeEngine.awardAction(session.userId, 'ask');
                showToast('Doubt posted! +5 points 🎉', 'success');
                if (newBadges.length > 0) {
                    setTimeout(() => showToast(`🏅 New badge: ${newBadges.join(', ')}!`, 'success'), 800);
                }
                closeModal();

            } catch (err) {
                console.error('[Doubts] Submit error:', err);
                showToast('Failed to post question. Please try again.', 'error');
            } finally {
                askSubmitBtn.disabled = false;
                askSubmitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">send</span> Post Question';
            }
        });
    }

    // ── Lightbox ──
    lightbox?.addEventListener('click', () => lightbox.classList.remove('open'));

    // ── Utils ──
    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function formatTime(date) {
        if (!date || !(date instanceof Date) || isNaN(date)) return '—';
        const diff  = Date.now() - date.getTime();
        const mins  = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days  = Math.floor(diff / 86400000);
        if (mins < 2)   return 'just now';
        if (mins < 60)  return `${mins}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7)   return `${days}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // Spin animation for loading button
    const style = document.createElement('style');
    style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);

})();
