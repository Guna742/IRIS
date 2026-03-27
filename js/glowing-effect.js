/**
 * Vanilla JS implementation of the React GlowingEffect component.
 */

class GlowingEffect {
    constructor(element, options = {}) {
        this.container = element;
        this.options = {
            blur: options.blur || 0,
            inactiveZone: options.inactiveZone || 0.7,
            proximity: options.proximity || 64, // Good default for cards
            spread: options.spread || 40,
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
            : `radial-gradient(circle, #dd7bbb 10%, #dd7bbb00 20%), radial-gradient(circle at 40% 40%, #d79f1e 5%, #d79f1e00 15%), radial-gradient(circle at 60% 60%, #5a922c 10%, #5a922c00 20%), radial-gradient(circle at 40% 60%, #4c7894 10%, #4c789400 20%), repeating-conic-gradient(from 236.84deg at 50% 50%, #dd7bbb 0%, #d79f1e calc(25% / var(--repeating-conic-gradient-times)), #5a922c calc(50% / var(--repeating-conic-gradient-times)), #4c7894 calc(75% / var(--repeating-conic-gradient-times)), #dd7bbb calc(100% / var(--repeating-conic-gradient-times)))`;

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
    const cards = document.querySelectorAll('.dash-card, .stat-card, .card, .history-item');
    cards.forEach(card => {
        // Skip if already initialized
        if (card.classList.contains('glowing-effect-container')) return;

        new GlowingEffect(card, {
            blur: 0,
            spread: 40,
            proximity: 64,
            borderWidth: 2,
            variant: "default"
        });
    });
}

document.addEventListener('DOMContentLoaded', initGlowingEffects);
