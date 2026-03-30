/**
 * ReminderSystem
 * Handles timed submission reminders at 12:30 PM and 5:30 PM.
 */

class ReminderSystem {
    constructor() {
        this.reminderTimes = [
            { time: "12:30", key: "reminder_1230", message: "It's 12:30 PM! Please submit your morning report before the 1:00 PM cutoff." },
            { time: "17:30", key: "reminder_1730", message: "It's 5:30 PM! Please submit your daily report before the 6:00 PM cutoff." }
        ];
        this.audioPath = 'alert/notification.mpeg';
        this.audio = new Audio(this.audioPath);
        this.checkInterval = 60000; // Check every minute
    }

    init() {
        // Start the check loop
        setInterval(() => this.check(), this.checkInterval);
        // Initial check immediately
        this.check();
        console.log("Reminder system initialized.");
    }

    async check() {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        const todayStr = now.toDateString();

        for (const slot of this.reminderTimes) {
            if (currentTime === slot.time) {
                const lastShown = localStorage.getItem(slot.key);
                if (lastShown !== todayStr) {
                    await this.triggerReminder(slot);
                    localStorage.setItem(slot.key, todayStr);
                }
            }
        }
    }

    async triggerReminder(slot) {
        try {
            // Attempt to play sound (may be blocked by browser until user interacts)
            await this.audio.play().catch(e => {
                console.warn("Audio play blocked. Waiting for interaction.");
            });

            // Show a premium modal alert using the existing IrisModal
            if (window.IrisModal) {
                await window.IrisModal.alert(
                    `<p style="text-align:center; margin-bottom:15px">${slot.message}</p>
                     <div style="text-align:center">
                        <span class="material-symbols-outlined" style="font-size:48px; color:var(--clr-primary)">timer</span>
                     </div>`,
                    "Submission Reminder"
                );
            } else {
                alert(slot.message);
            }
        } catch (error) {
            console.error("Error triggering reminder:", error);
        }
    }
}

// Global instance
window.irisReminder = new ReminderSystem();
window.addEventListener('DOMContentLoaded', () => {
    // We wait for the first user interaction to help with audio autoplay browser restrictions
    const firstInteractionHandler = () => {
        window.irisReminder.init();
        document.removeEventListener('click', firstInteractionHandler);
    };
    document.addEventListener('click', firstInteractionHandler);
    
    // Fallback if they don't click for a while
    setTimeout(() => {
        if (!window.irisReminder.initialized) {
             window.irisReminder.init();
             window.irisReminder.initialized = true;
        }
    }, 2000);
});
