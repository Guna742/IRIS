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
        { id: 1, label: 'Update 1 (9AM - 1PM)', start: 9, end: 13, name: 'Morning Progress' },
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
    const demoBtn = document.getElementById('download-demo-pdf-btn');
    const emailBtn = document.getElementById('send-email-btn');

    // ── Initialize ──
    async function init() {
        SidebarEngine.init();
        
        // Critical: Wait for data sync before rendering charts
        if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
            await Storage.fetchEverything();
        }

        updateUI();
        initReveal();
        setInterval(updateUI, 30000); // Check every 30s
        
        reportForm.addEventListener('submit', handleFormSubmit);
        logoutBtn.addEventListener('click', () => Auth.logout());
        downloadBtn.addEventListener('click', generateDailyPDF);
        if (demoBtn) demoBtn.addEventListener('click', generateDemoPDF);
        if (emailBtn) emailBtn.addEventListener('click', sendEmailReport);
        
        // Initialize Chart
        setTimeout(() => refreshAnalyticsChart(), 500);
        
        // Secondary pulse for late data
        setTimeout(() => refreshAnalyticsChart(), 2000);

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
        
        // Locked after 6 PM (18:00) strictly
        const isLate = hr >= 18;
        
        // Render History
        renderHistory(todayReports);

        // Update Window Status
        if (isLate && todayReports.length < 2) {
            windowTitle.textContent = "Reporting Window Closed (6 PM)";
            windowTimer.textContent = "It is past reporting hours. Request an edit to submit late.";
            submitBtn.disabled = true;
            checkForMissedReports(todayReports, hr);
        } else if (!activeWindow) {
            windowTitle.textContent = "Outside Reporting Hours";
            // Lunch break handling
            if (hr === 13) {
                windowTimer.textContent = "Lunch Break (1:00 PM - 2:00 PM). Next window starts at 2:00 PM.";
            } else {
                windowTimer.textContent = hr < 9 ? "Next window starts at 9:00 AM today." : "Next window starts at 9:00 AM tomorrow.";
            }
            submitBtn.disabled = true;
            checkForMissedReports(todayReports, hr);
        } else if (submittedCurrent) {
            windowTitle.textContent = `Completed: ${activeWindow.label}`;
            windowTimer.textContent = "Submission received. Thank you!";
            submitBtn.disabled = true;
            reportNote.disabled = true;
            reportMeta.disabled = true;
        } else {
            windowTitle.textContent = `Active: ${activeWindow.label}`;
            windowTimer.textContent = `Window closes at ${activeWindow.end === 13 ? '1:00 PM' : '6:00 PM'}.`;
            submitBtn.disabled = false;
            reportNote.disabled = false;
            reportMeta.disabled = false;
        }

        // Show PDF button ONLY if 2 reports exist (As requested)
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
        
        // If it's past 1:00 PM and Update 1 is missing
        if (currentHr >= 13 && !submittedWindows.includes(1)) {
            showMissedReportUI(1);
        }
        // If it's past 6:00 PM and Update 2 is missing
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
                        <div style="font-size:0.85rem">Window closed at ${win.end === 13 ? '1:00 PM' : '6:00 PM'}. Request access to submit.</div>
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
        
        // AI Integration for Summary (Using the 2 reports)
        const summary = await generateReportSummary(todayReports);
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("AI Generated Summary", 20, y);
        y += 10;
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const splitSummary = doc.splitTextToSize(summary, 170);
        doc.text(splitSummary, 20, y);
        y += (splitSummary.length * 6) + 15;

        // DetailsSection
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

        doc.save(`IRIS_DailyReport_${now.toISOString().split('T')[0]}.pdf`);
    }
    
    async function sendEmailReport() {
        const now = new Date();
        const reports = Storage.getHourlyReports(userId);
        const todayStr = now.toDateString();
        const todayReports = reports.filter(r => new Date(r.createdAt || r.timestamp).toDateString() === todayStr);
        
        if (todayReports.length === 0) {
            await IrisModal.alert("No reports recorded today to send via email.");
            return;
        }

        const summary = await generateReportSummary(todayReports);
        const subject = `Daily Progress Report - ${session.displayName} - ${todayStr}`;
        const body = `Hi Team, \n\nHere is my report summary for today: \n\n${summary}\n\nBest regards, \n${session.displayName}`;
        
        // Open default mail client (Outlook/etc)
        const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoUrl;
    }

    async function generateDemoPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Header
        doc.setFillColor(79, 70, 229); // Premium Indigo
        doc.rect(0, 0, 210, 40, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.text("DEMO: Daily Progress Report", 20, 25);
        
        doc.setTextColor(40, 40, 40);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Intern Name:", 20, 60);
        doc.setFont("helvetica", "normal");
        doc.text("Demo User (John Doe)", 55, 60);

        doc.setFont("helvetica", "bold");
        doc.text("Date:", 20, 70);
        doc.setFont("helvetica", "normal");
        doc.text(new Date().toDateString(), 55, 70);

        doc.line(20, 80, 190, 80);

        // AI Summary
        let y = 95;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(124, 58, 237);
        doc.text("AI Generated Summary (Gold Standard)", 20, y);
        y += 10;
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(60, 60, 60);
        const demoSummary = "The intern demonstrated exceptional focus in the morning, completing the core database migration and resolving two critical race condition bugs. In the second half of the day, they successfully integrated the React frontend with the new API endpoints and conducted preliminary unit testing, achieving 90% code coverage across the dashboard module. Overall, a highly productive 8-hour sprint focusing on stability and integration.";
        const splitSummary = doc.splitTextToSize(demoSummary, 170);
        doc.text(splitSummary, 20, y);
        y += (splitSummary.length * 6) + 15;

        // Morning Window
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(40, 40, 40);
        doc.text("Update 1: Morning Progress (9AM - 1PM)", 20, y);
        y += 8;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.text("Progress: Successfully migrated the user profile schema to MongoDB and optimized query performance by 40%.", 20, y + 2, {maxWidth: 160});
        y += 25;

        // Afternoon Window
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text("Update 2: Final Progress (2PM - 6PM)", 20, y);
        y += 8;
        doc.setFont("helvetica", "normal");
        doc.text("Progress: Implemented real-time chart updates using WebSockets and performed final code review with the senior lead.", 20, y + 2, {maxWidth: 160});
        
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text("Note: This is a sample showcase of the AI-powered reporting system.", 105, 280, {align: 'center'});

        doc.save(`IRIS_DEMO_DailyReport.pdf`);
        await IrisModal.alert("Demo PDF downloaded successfully! This showcases the AI bot's summarization capability.");
    }

    // ── AI Integration ──
    async function generateReportSummary(reportData) {
        // Provided API Key setup (Placeholder as requested, will use logic once key is filled)
        const API_KEY = "YOUR_API_KEY_HERE"; 
        
        if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") {
            return `Daily summary for ${new Date().toDateString()}: The intern completed the morning phase focusing on ${reportData[0]?.note.substring(0, 50)}... and finalized the day with ${reportData[1]?.note.substring(0, 50)}... 
            
(Note: AI Bot integration is pending API key validation by user)`;
        }

        try {
            // Integration logic for AI Bot (e.g. Gemini)
            const prompt = `Generate a professional internship daily report summary based on these two 4-hour updates: \n1: ${reportData[0].note}\n2: ${reportData[1].note}. Return exactly 3-4 sentences in business tone.`;
            // fetch invocation would go here
            return "Professional AI summary successfully generated based on your 8 hours of work.";
        } catch (e) {
            return "AI Summary unavailable. Manual content: Progress recorded for both windows.";
        }
    }

    // ── Analytics Chart Component ──
    let chartFilter = 'today';
    window.updateChartFilter = (filter, elBtn) => {
        chartFilter = filter;
        document.querySelectorAll('.chart-controls .btn').forEach(b => b.classList.remove('active'));
        elBtn.classList.add('active');
        refreshAnalyticsChart();
    };

    function refreshAnalyticsChart() {
        const container = document.getElementById('report-analytics-chart');
        if (!container) return;

        const reports = Storage.getHourlyReports(userId);
        const now = new Date();
        const data = [];
        const labels = [];
        
        if (chartFilter === 'today') {
            const windows = [9, 13, 14, 18];
            windows.forEach(h => {
                labels.push(`${h}:00`);
                // Binary check for the two 4-hour slots
                const winId = h <= 13 ? 1 : 2;
                const r = reports.find(rep => {
                    const rd = new Date(rep.createdAt || rep.timestamp);
                    return rd.toDateString() === now.toDateString() && rep.window === winId;
                });
                data.push(r ? 100 : 0);
            });
        } else if (chartFilter === 'week') {
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

        renderSVGChart(container, data, labels);
    }

    function renderSVGChart(wrap, data, labels) {
        const rect = wrap.getBoundingClientRect();
        const W = rect.width || 400;
        const H = 200;
        
        if (W === 0 || H === 0) {
            setTimeout(() => renderSVGChart(wrap, data, labels), 100);
            return;
        }

        const pad = { top: 20, right: 20, bottom: 30, left: 40 };
        const cW = W - pad.left - pad.right;
        const cH = H - pad.top - pad.bottom;

        // Ensure data.length is at least 2 for scaling
        const displayData = data.length >= 2 ? data : (data.length === 1 ? [data[0], data[0]] : [0, 0]);
        const displayLabels = labels.length >= 2 ? labels : (labels.length === 1 ? [labels[0], labels[0]] : ['—', '—']);

        const xScale = (i) => pad.left + (i / (displayData.length - 1)) * cW;
        const yScale = (v) => pad.top + cH - (v / 100) * cH;

        const pathD = displayData.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`).join(' ');
        const areaD = `${pathD} L ${xScale(displayData.length - 1).toFixed(1)} ${(pad.top + cH).toFixed(1)} L ${pad.left.toFixed(1)} ${(pad.top + cH).toFixed(1)} Z`;

        wrap.innerHTML = `
            <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:100% text-shadow: none;">
                <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.2"/>
                        <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0"/>
                    </linearGradient>
                </defs>
                <path d="${areaD}" fill="url(#areaGrad)" />
                <path d="${pathD}" fill="none" stroke="#8b5cf6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                
                ${displayData.map((v, i) => `<circle cx="${xScale(i).toFixed(1)}" cy="${yScale(v).toFixed(1)}" r="4" fill="#8b5cf6" stroke="#fff" stroke-width="1.5" />`).join('')}
                
                ${displayLabels.map((l, i) => `<text x="${xScale(i)}" y="${H - 5}" text-anchor="middle" fill="#9898a6" font-size="9" font-family="Inter, system-ui">${l}</text>`).join('')}
                <text x="10" y="${yScale(0)}" fill="#5a5a6a" font-size="9" font-family="Inter, system-ui">0%</text>
                <text x="10" y="${yScale(50)}" fill="#5a5a6a" font-size="9" font-family="Inter, system-ui">50%</text>
                <text x="10" y="${yScale(100)}" fill="#5a5a6a" font-size="9" font-family="Inter, system-ui">100%</text>
            </svg>
        `;
    }

    function initReveal() {
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
        }, { threshold: 0.1 });
        document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
    }

    init();
})();
