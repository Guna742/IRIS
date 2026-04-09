/**
 * Vanilla JS implementation of the React GlowingEffect component.
 */

class GlowingEffect {
    constructor(element, options = {}) {
        this.container = element;
        this.options = {
            blur: options.blur || 12,
            inactiveZone: options.inactiveZone || 0.6,
            proximity: options.proximity || 100, 
            spread: options.spread || 50,
            variant: options.variant || "default",
            glow: options.glow !== undefined ? options.glow : true,
            borderWidth: options.borderWidth || 2,
            disabled: options.disabled || false
        };

        this.lastPosition = { x: 0, y: 0 };
        this.animationFrame = null;
        this.currentAngle = 0;
        this.targetAngle = 0;

        // Setup easing & animation properties
        this.isAnimating = false;

        this.init();
    }

    init() {
        if (this.options.disabled) return;

        // Apply base styles to container
        this.container.style.setProperty("--blur", `${this.options.blur}px`);
        this.container.style.setProperty("--spread", this.options.spread);
        this.container.style.setProperty("--start", "0");
        this.container.style.setProperty("--active", "0");
        this.container.style.setProperty("--glowingeffect-border-width", `${this.options.borderWidth}px`);
        this.container.style.setProperty("--repeating-conic-gradient-times", "5");

        const gradient = this.options.variant === "white"
            ? `repeating-conic-gradient(from 236.84deg at 50% 50%, var(--black), var(--black) calc(25% / var(--repeating-conic-gradient-times)))`
            : `radial-gradient(circle at center, rgba(255, 255, 255, 0.12) 0%, rgba(99, 102, 241, 0.08) 50%, transparent 100%)`;

        this.container.style.setProperty("--gradient", gradient);

        this.handleMove = this.handleMove.bind(this);

        document.body.addEventListener("pointermove", this.handleMove, { passive: true });
        window.addEventListener("scroll", () => this.handleMove(), { passive: true });

        // Create the glow DOM elements
        this.glowWrap = document.createElement('div');
        this.glowWrap.className = 'glowing-effect-wrap';
        if (this.options.blur > 0) {
            this.glowWrap.classList.add('has-blur');
        }

        this.glowInner = document.createElement('div');
        this.glowInner.className = 'glowing-effect-inner';
        this.glowWrap.appendChild(this.glowInner);

        this.container.classList.add('glowing-effect-container');
        this.container.insertBefore(this.glowWrap, this.container.firstChild);
    }

    handleMove(e) {
        if (!this.container) return;

        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }

        this.animationFrame = requestAnimationFrame(() => {
            const rect = this.container.getBoundingClientRect();

            const mouseX = e && e.clientX !== undefined ? e.clientX : this.lastPosition.x;
            const mouseY = e && e.clientY !== undefined ? e.clientY : this.lastPosition.y;

            if (e && e.clientX !== undefined) {
                this.lastPosition = { x: mouseX, y: mouseY };
            }

            const center = [rect.left + rect.width * 0.5, rect.top + rect.height * 0.5];
            const distanceFromCenter = Math.hypot(mouseX - center[0], mouseY - center[1]);
            const inactiveRadius = 0.5 * Math.min(rect.width, rect.height) * this.options.inactiveZone;

            if (distanceFromCenter < inactiveRadius) {
                this.container.style.setProperty("--active", "0");
                return;
            }

            const proximity = this.options.proximity;
            const isActive =
                mouseX > rect.left - proximity &&
                mouseX < rect.left + rect.width + proximity &&
                mouseY > rect.top - proximity &&
                mouseY < rect.top + rect.height + proximity;

            this.container.style.setProperty("--active", isActive ? "1" : "0");

            if (!isActive) return;

            let targetAngle = (180 * Math.atan2(mouseY - center[1], mouseX - center[0])) / Math.PI + 90;
            const angleDiff = ((targetAngle - this.currentAngle + 180) % 360) - 180;
            this.targetAngle = this.currentAngle + angleDiff;

            this.animateToTarget();
        });
    }

    animateToTarget() {
        const step = () => {
            const diff = this.targetAngle - this.currentAngle;
            if (Math.abs(diff) < 0.1) {
                this.currentAngle = this.targetAngle;
                this.isAnimating = false;
            } else {
                // Smooth interpolation step
                this.currentAngle += diff * 0.1;
                this.container.style.setProperty("--start", String(this.currentAngle));
                
                // Also set normalized mouse positions for radial effects
                const rect = this.container.getBoundingClientRect();
                const nx = (this.lastPosition.x - rect.left) / rect.width;
                const ny = (this.lastPosition.y - rect.top) / rect.height;
                this.container.style.setProperty("--mouse-x", (nx * 100).toFixed(2) + "%");
                this.container.style.setProperty("--mouse-y", (ny * 100).toFixed(2) + "%");

                this.isAnimating = requestAnimationFrame(step);
            }
        };

        if (!this.isAnimating) {
            this.isAnimating = requestAnimationFrame(step);
        }
    }
}

// Global auto-init function for applying to the dashboard
function initGlowingEffects() {
    const cards = document.querySelectorAll('.dash-card, .stat-card, .card, .history-item, .proj-item');
    cards.forEach(card => {
        // Skip if already initialized
        if (card.classList.contains('glowing-effect-container')) return;

        new GlowingEffect(card, {
            blur: 15,
            spread: 60,
            proximity: 100,
            borderWidth: 2,
            variant: "default"
        });
        card.dataset.animated = 'true';
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (window.__IRIS_GLOW_EFFECT_INITIALIZED__) return;
    window.__IRIS_GLOW_EFFECT_INITIALIZED__ = true;
    initGlowingEffects();
});
