/*
 * *****************************************************************************
 * @license
 * Panda Timer <https://github.com/chuot/panda-timer>
 * Copyright (C) 2022 Chrystian Huot <chrystian.huot@saubeo.solutions>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>
 * ****************************************************************************
 */

class PandaTimer {
    get timeLeft() {
        return Math.max(0, Math.round((this.#dateEnd.getTime() - new Date().getTime()) / 1000));
    }

    get #box() {
        return this.#canvas.getBoundingClientRect();
    }

    get #centerX() {
        return this.#canvas.width / 2;
    }

    get #centerY() {
        return this.#canvas.height / 2;
    }

    get #height() {
        return this.#canvas.height;
    }

    get #radius() {
        return Math.floor(Math.min(this.#canvas.height, this.#canvas.width) / 2 * 0.9);
    }

    get #width() {
        return this.#canvas.width;
    }

    #audioContext;
    #audioContextBusy;
    #canvas;
    #config;
    #ctx;
    #cursorMoving;
    #cursorPrevious
    #dateEnd
    #intervalHandle;
    #subscriptions = [];

    constructor(canvas = document.getElementById('panda-timer'), config) {
        if (canvas instanceof HTMLCanvasElement)
            this.#canvas = canvas;
        else
            throw Error('canvas is not an instanceof HTMLCanvasElement');

        this.#config = {
            alterable: typeof config?.alterable === 'boolean' ? config.alterable : PandaTimer.defaultConfig.alterable,
            autostart: typeof config?.autostart === 'boolean' ? config.autostart : PandaTimer.defaultConfig.autostart,
            color: {
                background: typeof config?.color?.background === 'string' ? config.color.background : PandaTimer.defaultConfig.color.background,
                cursor: typeof config?.color?.cursor === 'string' ? config.color.cursor : PandaTimer.defaultConfig.color.cursor,
                face: typeof config?.color?.face === 'string' ? config.color.face : PandaTimer.defaultConfig.color.face,
                panda: typeof config?.color?.panda === 'string' ? config.color.panda : PandaTimer.defaultConfig.color.panda,
                scale: typeof config?.color?.scale === 'string' ? config.color.scale : PandaTimer.defaultConfig.color.scale,
                text: typeof config?.color?.text === 'string' ? config.color.text : PandaTimer.defaultConfig.color.text,
                timer: typeof config?.color?.timer === 'string' ? config.color.timer : PandaTimer.defaultConfig.color.timer,
            },
            font: typeof config?.font === 'string' ? config.font : PandaTimer.defaultConfig.font,
            indexed: typeof config?.indexed === 'boolean' ? config.indexed : PandaTimer.defaultConfig.indexed,
            reminders: typeof config?.reminders === 'boolean' ? config.reminders : PandaTimer.defaultConfig.reminders,
            text: {
                line1: typeof config?.text?.line1 === 'string' ? config.text.line1 : PandaTimer.defaultConfig.text.line1,
                line2: typeof config?.text?.line2 === 'string' ? config.text.line2 : PandaTimer.defaultConfig.text.line2,
            },
            timeLeft: Math.max(0, parseInt(`${config?.timeLeft}`)) || PandaTimer.defaultConfig.timeLeft,
            timeMax: Math.max(0, parseInt(`${config?.timeMax}`)) || PandaTimer.defaultConfig.timeMax,
        };

        this.#ctx = canvas && canvas.getContext('2d');

        this.#bootstrap();

        this.setTimeLeft(this.#config.timeLeft);

        this.#resize();

        this.#draw();

        if (this.#config.alterable) {
            this.#canvas.addEventListener('mousedown', this);
            this.#canvas.addEventListener('touchstart', this);
            this.#canvas.addEventListener('touchmove', this);
            this.#canvas.addEventListener('touchend', this);
        }

        document.addEventListener('visibilitychange', this);

        window.addEventListener('beforeunload', this);
        window.addEventListener('unload', this);
        window.addEventListener('resize', this);

        if (this.#config.autostart)
            this.start();
    }

    handleEvent(event) {
        switch (event.type) {
            case 'mousedown':
            case 'touchstart':
                this.#onTouch(event);
                break;

            case 'mousemove':
            case 'touchmove':
                this.#onMove(event);
                break;

            case 'mouseup':
            case 'touchend':
                this.#onRelease(event);
                break;

            case 'resize':
                this.#resize();
                this.#draw();
                break;

            case 'beforeunload':
                this.#confirmExit(event);
                break;

            case 'unload':
                this.stop();
                break;

            case 'visibilitychange':
                this.#onVisibility();
                break;

            default:
                break;
        }
    }

    setTimeLeft(timeLeft) {
        if (typeof timeLeft !== 'number') return;

        this.#dateEnd = new Date();

        this.#dateEnd.setSeconds(this.#dateEnd.getSeconds() + timeLeft);

        this.#draw();
    }

    start(timeLeft) {
        if (typeof timeLeft === 'number')
            this.setTimeLeft(timeLeft);

        if (!this.timeLeft) {
            this.#playCompleted();

            return;
        }

        if (this.#intervalHandle) {
            clearInterval(this.#intervalHandle);

            this.#tick();

            this.#draw();
        }

        this.#intervalHandle = setInterval(() => {
            this.#tick();

            if (this.timeLeft <= 0) {
                clearInterval(this.#intervalHandle);

                this.#intervalHandle = null;

                this.#playCompleted();

            } else {
                if (this.#config.reminders)
                    if (!(this.timeLeft % 300)) this.#playReminder();
            }

            this.#draw();
        }, 1000);
    }

    stop() {
        if (this.#intervalHandle) {
            clearInterval(this.#intervalHandle);

            this.#intervalHandle = null;
        }
    }

    subscribe(callback, timeLeft = 0) {
        const subscription = {
            unsubscribe: () => {
                const index = this.#subscriptions.find((s) => s === subscription);

                if (index !== -1) {
                    this.#subscriptions.splice(index, 1);

                    return true;

                } else {
                    return false;
                }
            },
            get callback() { return typeof callback === 'function' ? callback : () => { } },
            get timeLeft() { return Math.round(timeLeft) },
        };

        this.#subscriptions.push(subscription);

        return subscription;
    }

    #bootstrap() {
        const events = ['keydown', 'mousedown', 'touchstart'];

        const bootstrap = () => {
            if (!this.#audioContext)
                this.#audioContext = new (window.AudioContext || window.webkitAudioContext)();

            if (this.#audioContext) {
                if (this.#audioContext.state === 'suspended') {
                    this.#audioContext.resume();
                }

                events.forEach((event) => document.body.removeEventListener(event, bootstrap));
            }
        };

        events.forEach((event) => document.body.addEventListener(event, bootstrap));
    }

    #confirmExit(event) {
        if (!this.#intervalHandle) return;

        event.preventDefault();
        event.returnValue = '';
    }

    #draw() {
        this.#drawBackground();
        this.#drawFace();
        this.#drawTicks();
        this.#drawTimeLeft();
        this.#drawPanda();

        if (this.#config.alterable)
            this.#drawCursor();

        this.#drawNumbers();
        this.#drawText();
    }

    #drawBackground() {
        this.#ctx.rect(0, 0, this.#width, this.#height);
        this.#ctx.fillStyle = this.#config.color.background;
        this.#ctx.fill();
    }

    #drawCursor() {
        const angle = 2 * Math.PI / this.#config.timeMax * (this.#config.timeMax - this.timeLeft);

        this.#ctx.beginPath();
        this.#ctx.translate(this.#centerX + this.#radius * 0.8 * Math.sin(angle), this.#centerY + this.#radius * -0.8 * Math.cos(angle));
        this.#ctx.moveTo(0, 0);
        this.#ctx.rotate(angle);
        this.#ctx.lineTo(this.#radius * -0.1, this.#radius * -0.1);
        this.#ctx.arcTo(this.#radius * -0.1, this.#radius * -0.2, 0, this.#radius * -0.2, this.#radius * 0.1);
        this.#ctx.arcTo(this.#radius * 0.1, this.#radius * -0.2, this.#radius * 0.1, this.#radius * -0.1, this.#radius * 0.1);
        this.#ctx.lineTo(0, 0);
        this.#ctx.fillStyle = this.#config.color.cursor;
        this.#ctx.fill();
        this.#ctx.rotate(-angle);
        this.#ctx.translate(-this.#centerX + this.#radius * -0.8 * Math.sin(angle), -this.#centerY + this.#radius * 0.8 * Math.cos(angle));
    }

    #drawFace() {
        this.#ctx.beginPath();
        this.#ctx.arc(this.#centerX, this.#centerY, this.#radius * 1.1, 0, 2 * Math.PI);
        this.#ctx.fillStyle = this.#config.color.face;
        this.#ctx.fill();
    }

    #drawNumbers() {
        if (this.#config.timeMax < 720) return;

        const step = this.#config.timeMax / 60 / 12;

        this.#ctx.font = `bold ${this.#radius * (this.#config.timeMax > 3600 ? 0.1 : 0.15)}px ${this.#config.font}`;
        this.#ctx.textBaseline = 'middle';
        this.#ctx.textAlign = 'center';

        for (let i = 0; i < 12; i++) {
            const angle = i * Math.PI / -6;
            const label = `${Math.floor(i * step)}`;

            this.#ctx.fillStyle = [1, 2, 6, 10, 11].includes(i) ? this.#config.color.face : this.#config.color.scale;

            this.#ctx.translate(this.#centerX, this.#centerY);

            this.#ctx.beginPath();
            this.#ctx.rotate(angle);
            this.#ctx.translate(0, this.#radius * -0.925);
            this.#ctx.rotate(-angle);
            this.#ctx.fillText(label, 0, 0);
            this.#ctx.rotate(angle);
            this.#ctx.translate(0, this.#radius * 0.925);
            this.#ctx.rotate(-angle);

            this.#ctx.translate(-this.#centerX, -this.#centerY);
        }
    }

    #drawPanda() {
        this.#ctx.fillStyle = this.#config.color.panda;

        this.#ctx.translate(this.#centerX, this.#centerY);

        this.#ctx.beginPath();
        this.#ctx.rotate(-0.25 * Math.PI);
        this.#ctx.arc(0, this.#radius * -0.95, this.#radius * 0.4, 0.875 * Math.PI, 0.125 * Math.PI);
        this.#ctx.fill();
        this.#ctx.rotate(0.25 * Math.PI);

        this.#ctx.beginPath();
        this.#ctx.rotate(0.25 * Math.PI);
        this.#ctx.arc(0, this.#radius * -0.95, this.#radius * 0.4, 0.875 * Math.PI, 0.125 * Math.PI);
        this.#ctx.fill();
        this.#ctx.rotate(-0.25 * Math.PI);

        this.#ctx.beginPath();
        this.#ctx.ellipse(this.#radius * -0.35, 0, this.#radius * 0.25, this.#radius * 0.4, 0.1 * Math.PI, 0, 2 * Math.PI);
        this.#ctx.ellipse(this.#radius * 0.35, 0, this.#radius * 0.25, this.#radius * 0.4, -0.1 * Math.PI, 0, 2 * Math.PI);
        this.#ctx.fill();

        this.#ctx.beginPath();
        this.#ctx.arc(0, this.#radius * 0.85, this.#radius * 0.2, 1.925 * Math.PI, 1.075 * Math.PI);
        this.#ctx.fill();

        this.#ctx.translate(-this.#centerX, -this.#centerY);
    }

    #drawText() {
        this.#ctx.beginPath();
        this.#ctx.fillStyle = this.#config.color.text;
        this.#ctx.textBaseline = 'middle';
        this.#ctx.textAlign = 'center';

        if (this.#cursorMoving) {
            const timeLeft = this.timeLeft;

            const hours = this.#config.timeMax >= 3600 ? `${Math.floor(timeLeft / 3600)}h` : '';
            const minutes = `${Math.floor(timeLeft % 3600 / 60)}m`.replace(/^([0-9]m)/, '0$1');
            const seconds = `${timeLeft % 60}s`.replace(/^([0-9]s)/, '0$1');

            this.#ctx.font = `${this.#radius * 0.06}px monospace`;

            this.#ctx.fillText(`${hours} ${minutes} ${seconds}`, this.#centerX, this.#centerY + this.#radius * 0.45);

        } else {
            this.#ctx.font = `${this.#radius * 0.05}px ${this.#config.font}`;

            if (this.#config.text.line1 && this.#config.text.line2) {

                this.#ctx.fillText(this.#config.text.line1, this.#centerX, this.#centerY + this.#radius * 0.425);
                this.#ctx.fillText(this.#config.text.line2, this.#centerX, this.#centerY + this.#radius * 0.475);

            } else {
                this.#ctx.fillText(this.#config.text.line1 || this.#config.text.line2, this.#centerX, this.#centerY + this.#radius * 0.45);
            }
        }
    }

    #drawTicks() {
        for (let i = 0; i < 30; i++) {
            const angle = i * Math.PI / 30;
            const tickBegin = this.#radius * (i % 5 ? 0.7 : 0.6);
            const tickEnd = this.#radius * 0.8;
            const width = i % 5 ? 1 : 3;

            this.#ctx.translate(this.#centerX, this.#centerY);

            this.#ctx.beginPath();
            this.#ctx.moveTo(0, 0);
            this.#ctx.rotate(angle);
            this.#ctx.moveTo(0, tickBegin);
            this.#ctx.lineTo(0, tickEnd);
            this.#ctx.moveTo(0, -tickBegin);
            this.#ctx.lineTo(0, -tickEnd);
            this.#ctx.lineWidth = width;
            this.#ctx.strokeStyle = this.#config.color.scale;
            this.#ctx.stroke();
            this.#ctx.rotate(-angle);

            this.#ctx.translate(-this.#centerX, -this.#centerY);
        }
    }

    #drawTimeLeft() {
        const angle = 2 * Math.PI / this.#config.timeMax * (this.#config.timeMax - this.timeLeft) - 0.5 * Math.PI;

        this.#ctx.translate(this.#centerX, this.#centerY);

        this.#ctx.fillStyle = this.#config.color.timer;

        this.#ctx.beginPath();
        this.#ctx.moveTo(0, 0);
        this.#ctx.arc(0, 0, this.#radius * 0.8, angle, 1.5 * Math.PI);
        this.#ctx.lineTo(0, 0);
        this.#ctx.fill();

        this.#ctx.beginPath();
        this.#ctx.arc(0, 0, this.#radius * 0.025, 0, 2 * Math.PI);
        this.#ctx.shadowBlur = this.#radius * 0.01;
        this.#ctx.shadowColor = '#333';
        this.#ctx.fill();
        this.#ctx.shadowBlur = 0;

        this.#ctx.translate(-this.#centerX, -this.#centerY);
    }

    #onMove(event) {
        if (!this.#cursorMoving) return;

        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;

        const x = clientX - this.#box.x - this.#centerX;
        const y = clientY - this.#box.y - this.#centerY;

        let angle = Math.atan2(y, x) + 0.5 * Math.PI;

        if (angle < 0)
            angle += 2 * Math.PI

        let timeLeft = Math.round(this.#config.timeMax - (this.#config.timeMax / (2 * Math.PI) * angle));

        if (this.#config.indexed) {
            const tick = this.#config.timeMax / 60;

            timeLeft = Math.round(timeLeft / tick) * tick;
        }

        if (Math.abs(timeLeft - this.#cursorPrevious) < this.#config.timeMax / 2) {
            this.#cursorPrevious = timeLeft;

            this.setTimeLeft(timeLeft);
        }
    }

    #onRelease(event) {
        if (!event.touches) {
            document.removeEventListener('mousemove', this);
            document.removeEventListener('mouseup', this);
        }

        if (!this.#cursorMoving) return;

        this.#cursorMoving = false;

        this.#draw();

        if (this.timeLeft) {
            if (this.#config.autostart)
                this.start();

        } else {
            this.#playCompleted();
        }
    }

    #onTouch(event) {
        if (!event.touches) {
            document.addEventListener('mousemove', this);
            document.addEventListener('mouseup', this);
        }

        const angle = 2 * Math.PI / this.#config.timeMax * (this.#config.timeMax - this.timeLeft) - 0.5 * Math.PI;

        const cursorX = this.#centerX + this.#radius * 0.925 * Math.cos(angle);
        const cursorY = this.#centerY + this.#radius * 0.925 * Math.sin(angle);

        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;

        const x = clientX - this.#box.x;
        const y = clientY - this.#box.y;

        this.#cursorMoving = Math.sqrt((cursorX - x) ** 2 + (cursorY - y) ** 2) <= this.#radius * 0.15;

        if (this.#cursorMoving) {
            event.preventDefault();

            this.#cursorPrevious = this.timeLeft;

            this.#draw();

            this.stop();
        }
    }

    #onVisibility() {
        if (document.visibilityState === 'visible')
            if (this.#audioContext)
                if (this.#audioContext.state === 'suspended')
                    this.#audioContext.resume();
    }

    #playCompleted() {
        if (this.#audioContext)
            if (!this.#audioContextBusy) {
                this.#audioContextBusy = true;

                const gn = this.#audioContext.createGain();
                const osc1 = this.#audioContext.createOscillator();
                const osc2 = this.#audioContext.createOscillator();

                gn.gain.value = 1;
                gn.connect(this.#audioContext.destination);

                osc1.frequency.value = 2050;
                osc1.connect(gn);
                osc1.start(this.#audioContext.currentTime);
                osc1.stop(this.#audioContext.currentTime + 0.125);

                osc2.frequency.value = 2050;
                osc2.connect(gn);
                osc2.start(this.#audioContext.currentTime + 0.25);
                osc2.stop(this.#audioContext.currentTime + 0.35);

                osc2.onended = () => this.#audioContextBusy = false;
            }
    }

    #playReminder() {
        if (this.#audioContext && !this.#audioContextBusy) {
            this.#audioContextBusy = true;

            const osc = this.#audioContext.createOscillator();
            const gn = this.#audioContext.createGain();

            gn.gain.value = 0.1;
            gn.connect(this.#audioContext.destination);

            osc.frequency.value = 1850;
            osc.connect(gn);
            osc.start(this.#audioContext.currentTime);
            osc.stop(this.#audioContext.currentTime + 0.125);

            osc.onended = () => this.#audioContextBusy = false;
        }
    }

    #resize() {
        this.#canvas.height = this.#canvas.clientHeight;
        this.#canvas.width = this.#canvas.clientWidth;
    }

    #tick() {
        const timeLeft = this.timeLeft;

        this.#subscriptions.forEach((subscription) => {
            if (timeLeft === subscription.timeLeft) {
                subscription.callback(timeLeft);
            }
        });
    }
}

PandaTimer.defaultConfig = {
    alterable: true,
    autostart: true,
    color: {
        background: '#fff',
        cursor: 'rgba(255, 51, 51, 0.3)',
        face: '#fff',
        panda: '#333',
        scale: '#333',
        text: '#333',
        timer: '#f33',
    },
    font: 'arial',
    indexed: true,
    reminders: true,
    text: {
        line1: 'Panda Timer',
        line2: '',
    },
    timeLeft: 0,
    timeMax: 3600,
};
