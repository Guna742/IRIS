/**
 * I.R.I.S — Report Submission Logic (Template Edition)
 * Handles structured reporting intervals, PDF generation, and cross-window editing.
 */

'use strict';

(() => {
    // ── Auth Guard ──
    const session = Auth.requireAuth(['user']);
    if (!session) return;

    // ── Global State ──
    const userId = session.userId;
    const WINDOWS = [
        { id: 1, label: 'Morning Report (9AM - 1PM)', start: 9, end: 13, name: 'Morning Progress' },
        { id: 2, label: 'Afternoon Report (2PM - 6PM)', start: 14, end: 18, name: 'Final Progress' }
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
    
    // New Fields
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

        // Pre-fill signature if profile exists
        const profile = Storage.getProfile(userId);
        if (profile && fields.signature) {
            fields.signature.value = `Regards, ${profile.name || session.displayName} | Intern @ ${profile.internship?.company || 'I.R.I.S'}`;
        }
        
        setTimeout(() => refreshAnalyticsChart(), 500);
    }

    // ── Core Logic ──
    function updateUI() {
        if (editMode) return; // Don't disrupt editing

        const now = new Date();
        const hr = now.getHours();
        const reports = Storage.getHourlyReports(userId);
        const todayStr = now.toDateString();
        
        const todayReports = reports.filter(r => new Date(r.createdAt || r.timestamp).toDateString() === todayStr);
        let activeWindow = WINDOWS.find(w => hr >= w.start && hr < w.end);
        const submittedCurrent = activeWindow ? todayReports.find(r => r.window === activeWindow.id) : null;
        
        const isLate = hr >= 18;
        renderHistory(todayReports);

        // UI state based on time
        if (isLate) {
            windowTitle.textContent = "Reporting Window Closed (6 PM)";
            windowTimer.textContent = "Reporting hours have ended. Use history below to view today's logs.";
            setFormDisabled(true);
        } else if (!activeWindow) {
            windowTitle.textContent = hr === 13 ? "Lunch Break (1PM - 2PM)" : "Outside Reporting Hours";
            windowTimer.textContent = hr === 13 ? "Window 2 starts at 2:00 PM." : "Next window starts at 9:00 AM.";
            setFormDisabled(true);
        } else if (submittedCurrent) {
            windowTitle.textContent = `Submitted: ${activeWindow.label}`;
            windowTimer.textContent = "Update received. You can still edit your submissions in history today.";
            setFormDisabled(true);
        } else {
            windowTitle.textContent = `Active: ${activeWindow.label}`;
            windowTimer.textContent = `Please fill out your full progress report. Window closes at ${activeWindow.end === 13 ? '1:00 PM' : '6:00 PM'}.`;
            setFormDisabled(false);
            
            // ── Logout Time Requirement Logic ──
            // If it's Morning Session (Window 1), logoutTime is OPTIONAL
            // If it's Afternoon Session (Window 2), logoutTime is REQUIRED
            if (fields.logoutTime) {
                if (activeWindow.id === 1) {
                    fields.logoutTime.required = false;
                    fields.logoutTime.placeholder = "(Optional for morning)";
                } else {
                    fields.logoutTime.required = true;
                    fields.logoutTime.placeholder = "";
                }
            }
        }

        // Feature: Lunch/Afternoon edit capability
        // If we are in Afternoon (Window 2), allow editing Morning (Window 1)
        // This is handled by renderHistory's edit button being enabled for today's reports.

        downloadBtn.style.display = todayReports.length >= 1 ? 'flex' : 'none';
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
                await IrisModal.alert("No active reporting window found.");
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
            note: `Task Summary: ${reportData.tasksAssigned.substring(0, 50)}...`, // Searchable summary
            data: reportData,
            timestamp: now.getTime()
        };

        if (editMode && editingReportId) {
            Storage.updateHourlyReport(editingReportId, report);
            await IrisModal.alert("Report updated successfully!");
            cancelEdit();
        } else {
            Storage.saveHourlyReport(report);
            if (Storage.saveActivityReportToFirebase) {
                Storage.saveActivityReportToFirebase(userId, report);
            }
            reportForm.reset();
            await IrisModal.alert("Daily progress report submitted successfully!");
        }
        
        updateUI();
    }

    function renderHistory(reports) {
        if (reports.length === 0) {
            historyContainer.innerHTML = `<div style="grid-column:1/-1; padding:40px; text-align:center; color:var(--clr-text-muted); border:1px dashed var(--clr-border); border-radius:16px">No reports submitted today yet.</div>`;
            return;
        }

        const now = new Date();
        const isToday = (ts) => new Date(ts).toDateString() === now.toDateString();

        historyContainer.innerHTML = reports.sort((a,b) => a.window - b.window).map(r => {
            const w = WINDOWS.find(win => win.id === r.window) || { label: 'Special Window' };
            const timeStr = new Date(r.createdAt || r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            // Allow edit if it's today's report
            const canEdit = isToday(r.createdAt || r.timestamp);

            return `
                <div class="history-card">
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px">
                        <span class="badge ${r.window === 1 ? 'badge-primary' : 'badge-success'}">${w.label}</span>
                        <span class="history-time">${timeStr}</span>
                    </div>
                    <div class="history-note"><strong>Status:</strong> ${r.note}</div>
                    <div style="margin-top:15px; display:flex; gap:10px">
                        <button class="btn btn-secondary btn-xs" onclick="viewDetailedReport('${r.id}')">View Details</button>
                        ${canEdit ? `<button class="btn btn-primary btn-xs" onclick="prepareEdit('${r.id}')">Edit Report</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    window.viewDetailedReport = async (id) => {
        const r = Storage.getHourlyReportById(id);
        if (!r || !r.data) {
            return IrisModal.alert("This report uses an older format and has no technical details.");
        }
        
        const d = r.data;
        const html = `
            <div style="text-align:left; font-size:0.9rem; line-height:1.6; max-height:70vh; overflow-y:auto; padding-right:10px">
                <p><strong>Login/Logout:</strong> ${d.loginTime} - ${d.logoutTime}</p>
                <p><strong>Tasks Assigned:</strong> ${d.tasksAssigned}</p>
                <h4 style="margin:15px 0 5px; color:var(--clr-primary)">Completed Tasks</h4>
                ${d.tasksCompleted.map(tc => tc.name ? `<div style="margin-bottom:10px"><strong>${tc.name}:</strong><br>${tc.desc}</div>` : '').join('')}
                ${d.extraWork ? `<p><strong>Extra Work:</strong> ${d.extraWork}</p>` : ''}
                <p><strong>Work in Progress:</strong> ${d.workInProgress}</p>
                <p><strong>Pending:</strong> ${d.pendingTasks}</p>
                <p><strong>Learned Today:</strong> ${d.whatLearned}</p>
                <p><strong>Challenges:</strong> ${d.challenges}</p>
                <p><strong>Next Steps:</strong> ${d.nextSteps}</p>
            </div>
        `;
        await IrisModal.confirm(html, { title: 'Technical Progress Details', confirmText: 'Close', hideCancel: true });
    };

    window.prepareEdit = (id) => {
        const r = Storage.getHourlyReportById(id);
        if (!r) return;
        
        if (!r.data) {
            IrisModal.alert("Old format reports cannot be edited using the new template.");
            return;
        }

        editMode = true;
        editingReportId = id;
        
        // Populate fields
        const d = r.data;
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

        // UI Changes
        setFormDisabled(false);
        submitBtnText.textContent = "Update Report (" + (r.window === 1 ? 'Morning' : 'Afternoon') + ")";
        cancelEditBtn.style.display = 'block';
        windowTitle.textContent = "Editing Mode Active";
        windowTimer.textContent = "You are currently updating your previously submitted report.";
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    function cancelEdit() {
        editMode = false;
        editingReportId = null;
        reportForm.reset();
        submitBtnText.textContent = "Submit Full Report";
        cancelEditBtn.style.display = 'none';
        updateUI();
    }

    // ── PDF Generation ──
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
        doc.text(`Intern: ${profile.name || session.displayName} | Date: ${now.toDateString()}`, 15, 40);
        doc.line(15, 43, 195, 43);

        let y = 55;
        
        todayReports.forEach((r, idx) => {
            if (!r.data) return;
            const d = r.data;
            const winLabel = r.window === 1 ? "Morning Updates" : "Afternoon Updates";
            
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.setTextColor(139, 92, 246);
            doc.text(`${winLabel} (${d.loginTime} - ${d.logoutTime})`, 15, y);
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
            
            d.tasksCompleted.forEach((tc, i) => {
                if (tc.name) {
                    writeField(`Task ${i+1} (${tc.name})`, tc.desc);
                }
            });

            writeField("In Progress", d.workInProgress);
            writeField("Learned", d.whatLearned);
            writeField("Challenges", d.challenges);
            writeField("Next Steps", d.nextSteps);
            
            y += 5;
            if (y > 250) { doc.addPage(); y = 20; }
        });

        const signature = todayReports[todayReports.length-1]?.data?.signature || "Sincerely, Intern";
        y += 15;
        doc.setFont("helvetica", "italic");
        doc.text(signature, 15, y);

        doc.save(`IRIS_FullReport_${now.toISOString().split('T')[0]}.pdf`);
    }

    // ── Analytics Chart Component (Simplified for brevity) ──
    function refreshAnalyticsChart() {
        const container = document.getElementById('report-analytics-chart');
        if (!container) return;
        const reports = Storage.getHourlyReports(userId);
        const todayCount = reports.filter(r => new Date(r.createdAt || r.timestamp).toDateString() === new Date().toDateString()).length;
        const perc = (todayCount / 2) * 100;
        
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%">
                <div style="font-size:3rem; font-weight:800; color:var(--clr-primary)">${perc}%</div>
                <div style="color:var(--clr-text-muted)">Daily Target Completed</div>
                <div style="width:200px; height:8px; background:rgba(255,255,255,0.05); border-radius:4px; margin-top:15px; overflow:hidden">
                    <div style="width:${perc}%; height:100%; background:var(--clr-primary); box-shadow:0 0 10px var(--clr-primary)"></div>
                </div>
            </div>
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
