/**
 * I.R.I.S — Badges UI Engine (Leagues Edition)
 * Controls the rendering logic for the Clash-inspired League Levels.
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const session = Auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
        return;
    }

    const userId = session.userId;
    const isAdmin = session.role === 'admin';

    // ── DOM Elements ──
    const gallery = document.getElementById('badges-gallery');
    const progressPanel = document.getElementById('user-progress-panel');
    const pointsDisplay = document.getElementById('user-points-display');
    const progressFill = document.getElementById('progress-fill');
    const nextMilestonePoints = document.getElementById('next-milestone-points');

    async function initBadges() {
        const { points, badges: earnedBadgeIds } = await BadgeEngine.getUserRewards(userId);
        
        const highestBadge = BadgeEngine.BADGES
            .filter(b => earnedBadgeIds.includes(b.id))
            .sort((a,b) => b.order - a.order)[0] || BadgeEngine.BADGES[0];

        if (!isAdmin) {
            progressPanel.style.display = 'flex';
            pointsDisplay.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <img src="${highestBadge.image}" style="height:28px; width:28px; object-fit:contain;" alt="${highestBadge.label}">
                    <span>${points} Points</span>
                </div>
            `;
            
            // Find next milestone & calculate remaining
            const nextBadge = BadgeEngine.BADGES.find(b => points < b.points);
            if (nextBadge) {
                const remaining = nextBadge.points - points;
                if (nextMilestonePoints) {
                    nextMilestonePoints.innerHTML = `
                        <div style="display:flex; flex-direction:column; align-items:flex-end;">
                            <div style="display:flex; align-items:center; gap:6px; font-size: 11px; opacity: 0.8;">
                                Next Level: ${nextBadge.label}
                                <img src="${nextBadge.image}" style="height:18px; width:18px; object-fit:contain;" alt="${nextBadge.label}">
                            </div>
                            <div style="color: var(--clr-accent); font-weight:900;">Need ${remaining.toLocaleString()} more XP</div>
                        </div>
                    `;
                }
            } else {
                if (nextMilestonePoints) nextMilestonePoints.innerHTML = `<span style="color:var(--clr-success); font-weight:bold;">Max Level Reached!</span>`;
            }

            const percentage = Math.min((points / 41000) * 100, 100);
            
            // Robust Animation Trigger for Mobile (Uses IntersectionObserver)
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        // Small delay to ensure browser paint
                        requestAnimationFrame(() => {
                            setTimeout(() => {
                                if (progressFill) progressFill.style.width = `${percentage}%`;
                            }, 100);
                        });
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.2 });

            if (progressPanel) observer.observe(progressPanel);
        }

        renderLeagueLevels(earnedBadgeIds, highestBadge ? highestBadge.id : 'bronze');
    }

    function renderLeagueLevels(earnedBadgeIds, currentBadgeId) {
        if (!gallery) return;

        const allBadges = BadgeEngine.BADGES;
        
        gallery.innerHTML = `
            <div class="league-container">
                ${allBadges.map((badge, index) => {
                    const isEarned = earnedBadgeIds.includes(badge.id);
                    const isCurrent = badge.id === currentBadgeId;
                    
                    return `
                        <div class="league-column ${badge.id} ${isEarned ? 'earned' : 'locked'} ${isCurrent ? 'current-rank' : ''}" style="animation-delay: ${index * 0.1}s">
                            <div class="league-badge-wrapper">
                                <div class="league-icon-container">
                                    <img src="${badge.image}" alt="${badge.label}" class="league-image">
                                </div>
                            </div>
                            <div class="league-pedestal">
                                <div class="league-name">${badge.label}</div>
                                <div class="league-req">
                                    ${badge.points}+ <span class="material-symbols-outlined" style="font-size:12px">military_tech</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    initBadges();
});
