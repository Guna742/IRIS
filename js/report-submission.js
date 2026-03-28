/**
 * I.R.I.S — Report Submission Logic
 * Handles 4-hour reporting intervals, PDF generation, and missed reports.
 */

'use strict';

(() => {
    // ── Auth Guard ──
    const session = Auth.requireAuth(['user']);
    if (!session) return;

    // ── Global State ──
    const userId = session.userId;
    const WINDOWS = [
        { id: 1, label: 'Update 1 (10AM - 2PM)', start: 10, end: 14, name: 'Morning Progress' },
        { id: 2, label: 'Update 2 (2PM - 6PM)', start: 14, end: 18, name: 'Final Progress' }
    ];

    // ── DOM Refs ──
    const sidebarNav = document.getElementById('sidebar-nav');
    const userAvatarSb = document.getElementById('user-avatar-sidebar');
    const userNameSb = document.getElementById('user-name-sidebar');
    const userRoleSb = document.getElementById('user-role-sidebar');
    const logoutBtn = document.getElementById('logout-btn');
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const appSidebar = document.getElementById('app-sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    const windowTitle = document.getElementById('window-title');
    const windowTimer = document.getElementById('window-timer');
    const reportForm = document.getElementById('report-form');
    const reportNote = document.getElementById('report-note');
    const reportMeta = document.getElementById('report-meta');
    const submitBtn = document.getElementById('submit-btn');
    const historyContainer = document.getElementById('report-history');
    const downloadBtn = document.getElementById('download-report-btn');

    // ── Initialize ──
    function init() {
        SidebarEngine.init();
        updateUI();
        initReveal();
        setInterval(updateUI, 30000); // Check every 30s
        
        reportForm.addEventListener('submit', handleFormSubmit);
        logoutBtn.addEventListener('click', () => Auth.logout());
        downloadBtn.addEventListener('click', generateDailyPDF);

        if (hamburgerBtn) {
            hamburgerBtn.addEventListener('click', () => {
                appSidebar.classList.add('open');
                sidebarOverlay.classList.add('visible');
            });
        }
        if (sidebarOverlay) {
            sidebarOverlay.classList.add('visible');
            sidebarOverlay.addEventListener('click', () => {
                appSidebar.classList.remove('open');
                sidebarOverlay.classList.remove('visible');
            });
        }
    }

    // ── Core Logic ──
    function updateUI() {
        const now = new Date();
        const hr = now.getHours();
        const reports = Storage.getHourlyReports(userId);
        const todayStr = now.toDateString();
        
        // Filter reports for today
        const todayReports = reports.filter(r => new Date(r.createdAt).toDateString() === todayStr);
        
        // Find current window
        let activeWindow = WINDOWS.find(w => hr >= w.start && hr < w.end);
        
        // Check if already submitted for current window
        const submittedCurrent = activeWindow ? todayReports.find(r => r.window === activeWindow.id) : null;
        
        // Render History
        renderHistory(todayReports);

        // Update Window Status
        if (!activeWindow) {
            windowTitle.textContent = "Outside Reporting Hours";
            windowTimer.textContent = "Next window starts at 10:00 AM завтра.";
            if (hr < 10) windowTimer.textContent = "Next window starts at 10:00 AM today.";
            submitBtn.disabled = true;
            
            // Check for missed reports
            checkForMissedReports(todayReports, hr);
        } else if (submittedCurrent) {
            windowTitle.textContent = `Completed: ${activeWindow.label}`;
            windowTimer.textContent = "Submission received. Thank you!";
            submitBtn.disabled = true;
            reportNote.disabled = true;
            reportMeta.disabled = true;
        } else {
            windowTitle.textContent = `Active: ${activeWindow.label}`;
            windowTimer.textContent = `Window closes at ${activeWindow.end}:00.`;
            submitBtn.disabled = false;
            reportNote.disabled = false;
            reportMeta.disabled = false;
        }

        // Show PDF button if 2 reports exist
        if (todayReports.length >= 2) {
            downloadBtn.style.display = 'flex';
        } else {
            downloadBtn.style.display = 'none';
        }
    }

    async function handleFormSubmit(e) {
        e.preventDefault();
        const now = new Date();
        const hr = now.getHours();
        const activeWindow = WINDOWS.find(w => hr >= w.start && hr < w.end);
        
        // Handle approved missed reports
        let windowToSubmit = activeWindow ? activeWindow.id : null;
        
        // Check if user has an approved missed report request
        const missedRequests = Storage.getMissedReportRequests(userId);
        const approvedRequest = missedRequests.find(r => r.status === 'approved' && new Date(r.date_requested).toDateString() === now.toDateString());
        
        if (!windowToSubmit && approvedRequest) {
            windowToSubmit = approvedRequest.window;
            // Mark request as fulfilled
            Storage.updateMissedReportRequestStatus(userId, approvedRequest.id, 'fulfilled');
        }

        if (!windowToSubmit) {
            await IrisModal.alert("No active reporting window found.");
            return;
        }

        const report = {
            userId: userId,
            window: windowToSubmit,
            note: reportNote.value,
            meta: reportMeta.value,
            timestamp: now.getTime()
        };

        Storage.saveHourlyReport(report);
        if (Storage.saveActivityReportToFirebase) {
            Storage.saveActivityReportToFirebase(userId, report);
        }

        reportForm.reset();
        await IrisModal.alert("Report submitted successfully!");
        updateUI();
    }

    function renderHistory(reports) {
        if (reports.length === 0) {
            historyContainer.innerHTML = `<div style="grid-column:1/-1; padding:40px; text-align:center; color:var(--clr-text-muted); border:1px dashed var(--clr-border); border-radius:16px">No reports submitted today yet.</div>`;
            return;
        }

        historyContainer.innerHTML = reports.sort((a,b) => a.window - b.window).map(r => {
            const w = WINDOWS.find(win => win.id === r.window) || { label: 'Out of Window' };
            const timeStr = new Date(r.createdAt || r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
                <div class="history-card">
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px">
                        <span class="badge ${r.window === 1 ? 'badge-primary' : 'badge-success'}">${w.label}</span>
                        <span class="history-time">${timeStr}</span>
                    </div>
                    <div class="history-note"><strong>Progress:</strong> ${r.note}</div>
                    ${r.meta ? `<div class="history-note" style="margin-top:8px; font-size:0.85rem; color:var(--clr-text-muted)"><strong>Notes:</strong> ${r.meta}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    function checkForMissedReports(todayReports, currentHr) {
        const now = new Date();
        const submittedWindows = todayReports.map(r => r.window);
        
        // If it's past 14:00 (2 PM) and Update 1 is missing
        if (currentHr >= 14 && !submittedWindows.includes(1)) {
            showMissedReportUI(1);
        }
        // If it's past 18:00 (6 PM) and Update 2 is missing
        if (currentHr >= 18 && !submittedWindows.includes(2)) {
            showMissedReportUI(2);
        }
    }

    function showMissedReportUI(windowId) {
        const win = WINDOWS.find(w => w.id === windowId);
        const existingContainer = document.getElementById(`missed-banner-${windowId}`);
        if (existingContainer) return;

        const missedRequests = Storage.getMissedReportRequests(userId);
        const pending = missedRequests.find(r => r.window === windowId && r.status === 'pending' && new Date(r.createdAt).toDateString() === new Date().toDateString());
        const approved = missedRequests.find(r => r.window === windowId && r.status === 'approved' && new Date(r.createdAt).toDateString() === new Date().toDateString());

        let bannerHTML = '';
        if (approved) {
            bannerHTML = `
                <div class="missed-banner" id="missed-banner-${windowId}" style="background:rgba(16,185,129,0.1); border-color:rgba(16,185,129,0.2)">
                    <div>
                        <div style="font-weight:700; color:var(--clr-success)">Approved: Missed Report Access</div>
                        <div style="font-size:0.85rem">You can now submit your ${win.label}. Submit via the form above.</div>
                    </div>
                    <button class="btn btn-success btn-sm" onclick="enableMissedSubmit(${windowId})">Start Submission</button>
                </div>
            `;
        } else if (pending) {
             bannerHTML = `
                <div class="missed-banner" id="missed-banner-${windowId}">
                    <div>
                        <div style="font-weight:700; color:#f59e0b">Pending Approval: ${win.label}</div>
                        <div style="font-size:0.85rem">Wait for Admin to approve your request.</div>
                    </div>
                    <span class="badge" style="background:#f59e0b20; color:#f59e0b">Pending</span>
                </div>
            `;
        } else {
            bannerHTML = `
                <div class="missed-banner" id="missed-banner-${windowId}">
                    <div>
                        <div style="font-weight:700; color:#ef4444">Missed Window: ${win.label}</div>
                        <div style="font-size:0.85rem">Window closed at ${win.end}:00. Request access to submit.</div>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="requestMissedAccess(${windowId})">Request Missed Report Access</button>
                </div>
            `;
        }

        const bannerWrap = document.createElement('div');
        bannerWrap.innerHTML = bannerHTML;
        document.getElementById('status-container').appendChild(bannerWrap.firstChild);
    }

    window.requestMissedAccess = async function(windowId) {
        const win = WINDOWS.find(w => w.id === windowId);
        const confirmMsg = `Request access to submit missed report for ${win.label}?`;
        if (!(await IrisModal.confirm(confirmMsg))) return;

        Storage.saveMissedReportRequest({
            userId: userId,
            userName: session.displayName,
            window: windowId,
            date_requested: new Date().toISOString()
        });

        await IrisModal.alert("Request sent to Admin Panel.");
        updateUI();
        // Remove and refresh banners
        const banner = document.getElementById(`missed-banner-${windowId}`);
        if (banner) banner.remove();
        updateUI();
    }

    window.enableMissedSubmit = function(windowId) {
        const win = WINDOWS.find(w => w.id === windowId);
        windowTitle.textContent = `Manual Entry: ${win.label}`;
        windowTimer.textContent = "Admin-approved manual submission active.";
        submitBtn.disabled = false;
        reportNote.disabled = false;
        reportMeta.disabled = false;
        reportNote.focus();
    }

    // ── PDF Generation ──
    async function generateDailyPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const now = new Date();
        const todayReports = Storage.getHourlyReports(userId).filter(r => new Date(r.createdAt).toDateString() === now.toDateString()).sort((a,b) => a.window - b.window);
        const profile = Storage.getProfile(userId);

        // Styling
        doc.setFillColor(31, 31, 46);
        doc.rect(0, 0, 210, 40, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.text("Daily Progress Report", 20, 25);
        
        doc.setFontSize(10);
        doc.text(`Generated: ${now.toLocaleString()}`, 140, 25);

        doc.setTextColor(40, 40, 40);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Intern Name:", 20, 60);
        doc.setFont("helvetica", "normal");
        doc.text(profile.name || session.displayName, 55, 60);

        doc.setFont("helvetica", "bold");
        doc.text("Date:", 20, 70);
        doc.setFont("helvetica", "normal");
        doc.text(now.toDateString(), 55, 70);

        doc.line(20, 80, 190, 80);

        let y = 95;
        todayReports.forEach((r, i) => {
            const w = WINDOWS.find(win => win.id === r.window);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text(`${w.label}`, 20, y);
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "italic");
            doc.text(`Submitted at ${new Date(r.createdAt).toLocaleTimeString()}`, 20, y + 7);
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            const splitNote = doc.splitTextToSize(`Progress: ${r.note}`, 160);
            doc.text(splitNote, 25, y + 17);
            
            y += 25 + (splitNote.length * 5);
            
            if (r.meta) {
                 const splitMeta = doc.splitTextToSize(`Notes: ${r.meta}`, 160);
                 doc.text(splitMeta, 25, y);
                 y += (splitMeta.length * 5) + 10;
            }
            
            y += 10;
        });

        // AI Summary Placeholder
        const summary = generateReportSummary(todayReports, "STUB_API_KEY");
        doc.setFont("helvetica", "bold");
        doc.text("AI Summary Preview:", 20, y);
        doc.setFont("helvetica", "normal");
        doc.text(summary, 20, y + 10);

        doc.save(`IRIS_DailyReport_${now.toISOString().split('T')[0]}.pdf`);
    }

    // ── AI Integration Stub ──
    function generateReportSummary(reportData, apiKey) {
        // Placeholder for future AI integration
        // return await fetchAI(reportData, apiKey);
        return "Integration Ready. (Waiting for API activation...)";
    }

    // ── Sidebar Helpers ──
    function setupSidebar() {
        const p = Storage.getProfile(userId);
        const currentName = p?.name || session.displayName;

        if (userAvatarSb) {
            if (p?.avatar) {
                userAvatarSb.innerHTML = `<img src="${p.avatar}" alt="${currentName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
            } else {
                userAvatarSb.textContent = currentName[0].toUpperCase();
            }
        }
        if (userNameSb) userNameSb.textContent = currentName;
        
        const items = [
            { label: 'Dashboard', href: 'dashboard.html', icon: 'grid_view' },
            { label: 'My Profile', href: 'student-profile.html', icon: 'person' },
            { label: 'Leaderboard', href: 'leaderboard.html', icon: 'leaderboard' },
            { label: 'My Analytics', href: `student-analytics.html?student=${userId}`, icon: 'analytics' },
            { label: 'Report Submission', href: 'report-submission.html', icon: 'description', active: true },
            { label: 'Projects', href: 'projects.html', icon: 'folder' },
            { label: 'Doubts', href: 'doubts.html', icon: 'help_center' },
        ];

        if (sidebarNav) {
            sidebarNav.innerHTML = '<div class="nav-section-label">Menu</div>' +
                items.map(item => `
                <a class="nav-item${item.active ? ' active' : ''}" href="${item.href}">
                    <span class="nav-icon"><span class="material-symbols-outlined">${item.icon}</span></span>
                    <span>${item.label}</span>
                </a>`).join('');
        }
    }

    // ── Reveal Animation ──
    function initReveal() {
        const revealEls = document.querySelectorAll('.reveal');
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        revealEls.forEach(el => observer.observe(el));
        
        // Secondary trigger for above-the-fold content
        setTimeout(() => {
            revealEls.forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.top < window.innerHeight) {
                    el.classList.add('visible');
                }
            });
        }, 100);
    }

    init();
})();
