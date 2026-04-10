/**
 * I.R.I.S — Employee Progress Reporting Logic
 * Handles structured reporting intervals, PDF generation, and log history.
 * Zero mention of interns.
 */

'use strict';

(() => {
    // ── Auth Guard ──
    const session = Auth.requireAuth(['employee', 'admin']);
    if (!session) return;

    // ── Global State ──
    const userId = session.userId;
    const WINDOWS = [
        { id: 1, label: 'Morning Session (9AM - 2PM)', start: 9, end: 14, name: 'Morning Report' },
        { id: 2, label: 'Afternoon Session (2PM - 8PM)', start: 14, end: 20, name: 'Evening Report' }
    ];

    let editMode = false;
    let editingReportId = null;

    // ── DOM Refs ──
    const windowTitle = document.getElementById('window-title');
    const windowTimer = document.getElementById('window-timer');
    const reportForm = document.getElementById('report-form');
    const submitBtn = document.getElementById('submit-btn');
    const submitBtnText = document.getElementById('submit-btn-text');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const historyContainer = document.getElementById('report-history');
    const downloadBtn = document.getElementById('download-report-btn');
    
    // Fields
    const fields = {
        loginTime: document.getElementById('login-time'),
        logoutTime: document.getElementById('logout-time'),
        tasksAssigned: document.getElementById('tasks-assigned'),
        task1Name: document.getElementById('task-1-name'),
        task1Desc: document.getElementById('task-1-desc'),
        task2Name: document.getElementById('task-2-name'),
        task2Desc: document.getElementById('task-2-desc'),
        taskExtra: document.getElementById('task-extra'),
        workInProgress: document.getElementById('work-in-progress'),
        pendingTasks: document.getElementById('pending-tasks'),
        whatLearned: document.getElementById('what-learned'),
        challenges: document.getElementById('challenges'),
        nextSteps: document.getElementById('next-steps'),
        signature: document.getElementById('signature')
    };

    const logoutBtn = document.getElementById('logout-btn');

    // ── Initialize ──
    async function init() {
        SidebarEngine.init();
        
        if (typeof Storage !== 'undefined' && Storage.fetchEverything) {
            await Storage.fetchEverything();
        }

        updateUI();
        initReveal();
        setInterval(updateUI, 60000); // Check every minute
        
        reportForm.addEventListener('submit', handleFormSubmit);
        if (cancelEditBtn) cancelEditBtn.addEventListener('click', cancelEdit);
        if (logoutBtn) logoutBtn.addEventListener('click', () => Auth.logout());
        if (downloadBtn) downloadBtn.addEventListener('click', generateDailyPDF);
        
        // Link new Preview and Email buttons
        document.getElementById('download-demo-pdf-btn')?.addEventListener('click', generateDailyPDF);
        document.getElementById('send-email-btn')?.addEventListener('click', handleEmailReport);

        // Pre-fill signature if profile exists
        const profile = Storage.getProfile(userId);
        if (profile && fields.signature) {
            fields.signature.value = `Regards, ${profile.name || session.displayName} | Employee @ ${profile.internship?.company || 'I.R.I.S'}`;
        }
        
        setTimeout(() => refreshAnalyticsChart(), 500);
    }

    // ── Core Logic ──
    function updateUI() {
        if (editMode) return; 

        const now = new Date();
        const hr = now.getHours();
        const reports = Storage.getHourlyReports(userId);
        const todayStr = now.toDateString();
        
        const todayReports = reports.filter(r => new Date(r.createdAt || r.timestamp).toDateString() === todayStr);
        let activeWindow = WINDOWS.find(w => hr >= w.start && hr < w.end);
        const submittedCurrent = activeWindow ? todayReports.find(r => r.window === activeWindow.id) : null;
        
        const isLate = hr >= 20;
        renderHistory(todayReports);

        // Always ensure form is interactive
        setFormDisabled(false);

        if (isLate) {
            windowTitle.textContent = "Reporting Period Closed";
            windowTimer.textContent = "Today's reporting window is closed (8 PM). You can still prepare drafts for tomorrow.";
            submitBtn.disabled = true;
            submitBtnText.textContent = "Log Closed";
        } else if (!activeWindow) {
            const isLunch = hr === 13;
            windowTitle.textContent = isLunch ? "Break Time" : "Outside Reporting Window";
            windowTimer.textContent = isLunch ? "Session 2 starts at 2:00 PM." : "Next reporting session starts at 9:00 AM.";
            submitBtn.disabled = true;
            submitBtnText.textContent = "Log Inactive";
        } else if (submittedCurrent) {
            loadReportToForm(submittedCurrent);
            windowTitle.textContent = "Updates Recorded";
            windowTimer.textContent = "You have already submitted a report for this session. You can update it below.";
            submitBtn.disabled = false;
            submitBtnText.textContent = "Update Progress Log";
            
            editMode = false;
            editingReportId = submittedCurrent.id; 
        } else {
            windowTitle.textContent = `Active Session: ${activeWindow.label}`;
            windowTimer.textContent = `Logging your progress for the current session. Ends at ${activeWindow.end === 14 ? '2:00 PM' : '8:00 PM'}.`;
            submitBtn.disabled = false;
            submitBtnText.textContent = "Submit Daily Progress";
            editingReportId = null;

            if (fields.logoutTime) {
                fields.logoutTime.required = (activeWindow.id === 2);
            }
        }

        if (downloadBtn) downloadBtn.style.display = todayReports.length >= 1 ? 'flex' : 'none';
        refreshAnalyticsChart();
    }

    function setFormDisabled(disabled) {
        Object.values(fields).forEach(f => { if(f) f.disabled = disabled; });
        submitBtn.disabled = disabled;
    }

    async function handleFormSubmit(e) {
        e.preventDefault();
        const now = new Date();
        const hr = now.getHours();
        
        let windowId = null;

        if (editMode && editingReportId) {
            const report = Storage.getHourlyReportById(editingReportId);
            windowId = report.window;
        } else {
            const activeWindow = WINDOWS.find(w => hr >= w.start && hr < w.end);
            if (!activeWindow) {
                await IrisModal.alert("No active session window found.");
                return;
            }
            windowId = activeWindow.id;
        }

        const reportData = {
            loginTime: fields.loginTime.value,
            logoutTime: fields.logoutTime.value,
            tasksAssigned: fields.tasksAssigned.value,
            tasksCompleted: [
                { name: fields.task1Name.value, desc: fields.task1Desc.value },
                { name: fields.task2Name.value, desc: fields.task2Desc.value }
            ],
            extraWork: fields.taskExtra.value,
            workInProgress: fields.workInProgress.value,
            pendingTasks: fields.pendingTasks.value,
            whatLearned: fields.whatLearned.value,
            challenges: fields.challenges.value,
            nextSteps: fields.nextSteps.value,
            signature: fields.signature.value
        };

        const report = {
            userId: userId,
            window: windowId,
            note: `Log Summary: ${reportData.tasksAssigned.substring(0, 50)}...`,
            data: reportData,
            timestamp: now.getTime()
        };

        if ((editMode || editingReportId) && editingReportId) {
            Storage.updateHourlyReport(editingReportId, report);
            await IrisModal.alert("Progress log updated successfully!");
            if (editMode) cancelEdit();
        } else {
            Storage.saveHourlyReport(report);
            reportForm.reset();
            await IrisModal.alert("Progress log submitted successfully!");
        }
        
        updateUI();
    }

    function renderHistory(reports) {
        if (reports.length === 0) {
            historyContainer.innerHTML = `<div style="grid-column:1/-1; padding:40px; text-align:center; color:var(--clr-text-muted); border:1px dashed var(--clr-border); border-radius:16px">No logs submitted today.</div>`;
            return;
        }

        const now = new Date();
        const isToday = (ts) => new Date(ts).toDateString() === now.toDateString();

        historyContainer.innerHTML = reports.sort((a,b) => a.window - b.window).map(r => {
            const w = WINDOWS.find(win => win.id === r.window) || { label: 'Progress Session' };
            const timeStr = new Date(r.createdAt || r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const canEdit = isToday(r.createdAt || r.timestamp);

            return `
                <div class="history-card">
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px">
                        <span class="badge ${r.window === 1 ? 'badge-primary' : 'badge-success'}">${w.label}</span>
                        <span class="history-time">${timeStr}</span>
                    </div>
                    <div class="history-note"><strong>Summary:</strong> ${r.note}</div>
                    <div style="margin-top:15px; display:flex; gap:10px">
                        <button class="btn btn-secondary btn-xs" onclick="viewDetailedReport('${r.id}')">View Details</button>
                        ${canEdit ? `<button class="btn btn-primary btn-xs" onclick="prepareEdit('${r.id}')">Modify log</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    window.viewDetailedReport = async (id) => {
        const r = Storage.getHourlyReportById(id);
        if (!r || !r.data) return IrisModal.alert("Report data unavailable.");
        
        const d = r.data;
        const html = `
            <div style="text-align:left; font-size:0.9rem; line-height:1.6; max-height:70vh; overflow-y:auto; padding-right:10px">
                <p><strong>Work Period:</strong> ${d.loginTime} - ${d.logoutTime}</p>
                <p><strong>Objectives:</strong> ${d.tasksAssigned}</p>
                <h4 style="margin:15px 0 5px; color:var(--clr-primary); font-family:inherit">Tasks Completed</h4>
                ${d.tasksCompleted.map(tc => tc.name ? `<div style="margin-bottom:10px"><strong>${tc.name}:</strong><br>${tc.desc}</div>` : '').join('')}
                ${d.extraWork ? `<p><strong>Additional:</strong> ${d.extraWork}</p>` : ''}
                <p><strong>Work in Progress:</strong> ${d.workInProgress}</p>
                <p><strong>Pending:</strong> ${d.pendingTasks}</p>
                <p><strong>Research & Findings:</strong> ${d.whatLearned}</p>
                <p><strong>Obstacles:</strong> ${d.challenges}</p>
                <p><strong>Roadmap:</strong> ${d.nextSteps}</p>
            </div>
        `;
        await IrisModal.confirm(html, { title: 'Progress Log Details', confirmText: 'Close', hideCancel: true });
    };

    function loadReportToForm(report) {
        if (!report || !report.data) return;
        const d = report.data;
        fields.loginTime.value = d.loginTime || '';
        fields.logoutTime.value = d.logoutTime || '';
        fields.tasksAssigned.value = d.tasksAssigned || '';
        fields.task1Name.value = d.tasksCompleted?.[0]?.name || '';
        fields.task1Desc.value = d.tasksCompleted?.[0]?.desc || '';
        fields.task2Name.value = d.tasksCompleted?.[1]?.name || '';
        fields.task2Desc.value = d.tasksCompleted?.[1]?.desc || '';
        fields.taskExtra.value = d.extraWork || '';
        fields.workInProgress.value = d.workInProgress || '';
        fields.pendingTasks.value = d.pendingTasks || '';
        fields.whatLearned.value = d.whatLearned || '';
        fields.challenges.value = d.challenges || '';
        fields.nextSteps.value = d.nextSteps || '';
        fields.signature.value = d.signature || '';
    }

    window.prepareEdit = (id) => {
        const r = Storage.getHourlyReportById(id);
        if (!r || !r.data) return;

        editMode = true;
        editingReportId = id;
        loadReportToForm(r);

        setFormDisabled(false);
        submitBtnText.textContent = "Update Session log";
        cancelEditBtn.style.display = 'block';
        windowTitle.textContent = "Updating Record";
        windowTimer.textContent = "You are currently editing a previously submitted log.";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    function cancelEdit() {
        editMode = false;
        editingReportId = null;
        reportForm.reset();
        submitBtnText.textContent = "Submit Daily Progress";
        if (cancelEditBtn) cancelEditBtn.style.display = 'none';
        updateUI();
    }

    // PDF 
    async function generateDailyPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const now = new Date();
        const todayReports = Storage.getHourlyReports(userId).filter(r => new Date(r.createdAt || r.timestamp).toDateString() === now.toDateString()).sort((a,b) => a.window - b.window);
        const profile = Storage.getProfile(userId);

        doc.setFillColor(31, 31, 46);
        doc.rect(0, 0, 210, 30, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.text("Daily Progress Report", 15, 20);
        
        doc.setTextColor(80, 80, 80);
        doc.setFontSize(10);
        doc.text(`Employee: ${profile.name || session.displayName} | Date: ${now.toDateString()}`, 15, 40);
        doc.line(15, 43, 195, 43);

        let y = 55;
        todayReports.forEach((r, idx) => {
            if (!r.data) return;
            const d = r.data;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.setTextColor(59, 130, 246);
            doc.text(`${r.window === 1 ? 'Morning' : 'Evening'} updates (${d.loginTime} - ${d.logoutTime})`, 15, y);
            y += 8;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(40, 40, 40);
            
            const writeField = (label, text) => {
                if (!text) return;
                doc.setFont("helvetica", "bold");
                doc.text(`${label}: `, 15, y);
                doc.setFont("helvetica", "normal");
                const splitText = doc.splitTextToSize(text, 170);
                doc.text(splitText, 15 + doc.getTextWidth(`${label}: `) + 2, y);
                y += (splitText.length * 5) + 3;
            };

            writeField("Assigned", d.tasksAssigned);
            d.tasksCompleted.forEach((tc, i) => { if (tc.name) writeField(`Task ${i+1} (${tc.name})`, tc.desc); });
            writeField("Progressing", d.workInProgress);
            writeField("Key Findings", d.whatLearned);
            writeField("Obstacles", d.challenges);
            writeField("Next Steps", d.nextSteps);
            y += 5;
            if (y > 250) { doc.addPage(); y = 20; }
        });
        const sig = todayReports[todayReports.length-1]?.data?.signature || "Sincerely, Employee";
        y += 15; doc.setFont("helvetica", "italic"); doc.text(sig, 15, y);
        doc.save(`IRIS_Employee_Log_${now.toISOString().split('T')[0]}.pdf`);
    }

    function handleEmailReport() {
        const profile = Storage.getProfile(userId);
        const name = profile.name || session.displayName;
        const subject = encodeURIComponent(`Daily Progress Log - ${name} - ${new Date().toDateString()}`);
        const body = encodeURIComponent(`Hello,\n\nPlease find my daily progress log for ${new Date().toDateString()} attached.\n\nBest regards,\n${name}`);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
        
        if (typeof IrisModal !== 'undefined') {
            IrisModal.alert("Email client opened! Please confirm you have attached the PDF log before sending.", "Email Report");
        }
    }

    let chartFilter = 'today';
    window.updateChartFilter = function (filter, el) {
        chartFilter = filter;
        const parent = el.closest('.chart-controls');
        if (parent) {
            parent.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
            el.classList.add('active');
        }
        refreshAnalyticsChart();
    };

    function refreshAnalyticsChart() {
        const container = document.getElementById('report-analytics-chart');
        if (!container) return;
        const reports = Storage.getHourlyReports(userId);
        const now = new Date(); now.setHours(0,0,0,0);
        let perc = 0; let label = "Target Completed";
        if (chartFilter === 'today') {
            const todayCount = reports.filter(r => new Date(r.createdAt || r.timestamp).toDateString() === new Date().toDateString()).length;
            perc = Math.min(100, Math.round((todayCount / 2) * 100));
            label = "Daily Achievement Score";
        } else if (chartFilter === 'week') {
            const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
            const weekReports = reports.filter(r => (r.createdAt || r.timestamp) >= sevenDaysAgo.getTime());
            perc = Math.min(100, Math.round((weekReports.length / 14) * 100));
            label = "Weekly Consistency Score";
        } else if (chartFilter === 'month') {
            const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
            const monthReports = reports.filter(r => (r.createdAt || r.timestamp) >= thirtyDaysAgo.getTime());
            perc = Math.min(100, Math.round((monthReports.length / 60) * 100));
            label = "Monthly Consistency Score";
        }
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%">
                <div style="font-size:3.5rem; font-weight:800; color:#3b82f6; text-shadow: 0 0 20px rgba(59, 130, 246, 0.3)">${perc}%</div>
                <div style="color:var(--clr-text-muted); font-size: 0.9rem; font-weight: 500; letter-spacing: 0.5px; margin-top: 5px;">${label}</div>
                <div style="width:240px; height:6px; background:rgba(255,255,255,0.05); border-radius:10px; margin-top:20px; overflow:hidden">
                    <div style="width:${perc}%; height:100%; background:#3b82f6; box-shadow:0 0 15px #3b82f6; transition: width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)"></div>
                </div>
            </div>`;
    }

    function initReveal() {
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
        }, { threshold: 0.1 });
        document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
    }
    init();
})();
