/*
 * *****************************************************************************
 * @license
 * Panda Timer <https://github.com/chuot/panda-timer>
 * Copyright (C) 2020 Chrystian Huot
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
        return Math.max(0, Math.round((this._dateEnd.getTime() - new Date().getTime()) / 1000));
    }

    get _centerX() {
        return this._canvas.width / 2;
    }

    get _centerY() {
        return this._canvas.height / 2;
    }

    get _height() {
        return this._canvas.height;
    }

    get _radius() {
        return Math.floor(Math.min(this._canvas.height, this._canvas.width) / 2 * 0.9);
    }

    get _width() {
        return this._canvas.width;
    }

    constructor(config = {}, canvas = document.getElementById('panda-timer')) {
        if (!(canvas instanceof HTMLCanvasElement)) {
            console.warn('canvas#panda-timer not found');

            return {};
        }

        this._audioContext = null;

        this._audioContextBusy = false;

        this._canvas = canvas;

        config = config !== null && typeof config === 'object' ? config : {};
        config.color = config.color !== null && typeof config.color === 'object' ? config.color : {};
        config.text = config.text !== null && typeof config.text === 'object' ? config.text : {};

        const timeLeft = parseInt(`${config.timeLeft}`);

        this._config = {
            alterable: typeof config.alterable === 'boolean' ? config.alterable : PandaTimer.defaultConfig.alterable,
            autostart: typeof config.autostart === 'boolean' ? config.autostart : PandaTimer.defaultConfig.autostart,
            color: {
                background: typeof config.color.background === 'string' ? config.color.background : PandaTimer.defaultConfig.color.background,
                cursor: typeof config.color.cursor === 'string' ? config.color.cursor : PandaTimer.defaultConfig.color.cursor,
                face: typeof config.color.face === 'string' ? config.color.face : PandaTimer.defaultConfig.color.face,
                panda: typeof config.color.panda === 'string' ? config.color.panda : PandaTimer.defaultConfig.color.panda,
                scale: typeof config.color.scale === 'string' ? config.color.scale : PandaTimer.defaultConfig.color.scale,
                text: typeof config.color.text === 'string' ? config.color.text : PandaTimer.defaultConfig.color.text,
                timer: typeof config.color.timer === 'string' ? config.color.timer : PandaTimer.defaultConfig.color.timer,
            },
            font: typeof config.font === 'string' ? config.font : PandaTimer.defaultConfig.font,
            indexed: typeof config.indexed === 'boolean' ? config.indexed : PandaTimer.defaultConfig.indexed,
            reminders: typeof config.reminders === 'boolean' ? config.reminders : PandaTimer.defaultConfig.reminders,
            text: {
                line1: typeof config.text.line1 === 'string' ? config.text.line1 : PandaTimer.defaultConfig.text.line1,
                line2: typeof config.text.line2 === 'string' ? config.text.line2 : PandaTimer.defaultConfig.text.line2,
            },
            timeLeft: isNaN(timeLeft) ? PandaTimer.defaultConfig.timeLeft : timeLeft,
            timeMax: Math.max(0, parseInt(`${config.timeMax}`)) || PandaTimer.defaultConfig.timeMax,
        };

        this._ctx = canvas && canvas.getContext('2d');

        this._cursorMoving = false;

        this._cursorPrevious = null;

        this._dateEnd = null;

        this._intervalHandle = null;

        this._responsive = !this._canvas.attributes.getNamedItem('height') && !this._canvas.attributes.getNamedItem('width');

        this._subscriptions = [];

        this._bootstrap();

        this.setTimeLeft(this._config.timeLeft);

        if (this._responsive) {
            this._resize();

            window.addEventListener('resize', () => {
                this._resize();

                this._draw();
            });
        }

        this._draw();

        if (this._config.alterable) {
            ['mousedown', 'touchstart'].forEach((type) => this._canvas.addEventListener(type, (event) => this._onTouch(event)));
            ['mousemove', 'touchmove'].forEach((type) => this._canvas.addEventListener(type, (event) => this._onMove(event)));
            ['mouseleave', 'mouseup', 'touchend'].forEach((type) => this._canvas.addEventListener(type, () => this._onRelease()));
        }

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                if (this.intervalHandle) {
                    this.start();

                } else {
                    this._draw();
                }

                if (this._audioContext) {
                    setTimeout(() => this._audioContext.resume(), 100);
                }
            }
        });

        window.addEventListener('beforeunload', (event) => {
            if (this._intervalHandle) {
                event.preventDefault();

                event.returnValue = '';
            }
        });

        window.addEventListener('unload', () => this.stop());

        if (this._config.autostart) {
            this.start();
        }
    }

    setTimeLeft(timeLeft) {
        if (typeof timeLeft !== 'number') {
            return;
        }

        this._dateEnd = new Date();

        this._dateEnd.setSeconds(this._dateEnd.getSeconds() + timeLeft);

        this._draw();
    }

    start(timeLeft) {
        if (typeof timeleft === 'number') {
            this.setTimeLeft(timeLeft);
        }

        if (!this.timeLeft) {
            this._playCompleted();

            return;
        }

        const interval = document.visibilityState === 'visible' ? 1 : 10000;

        if (this._intervalHandle) {
            clearInterval(this._intervalHandle);

            this._tick();

            this._draw();
        }

        this._intervalHandle = setInterval(() => {
            this._tick();

            if (this.timeLeft <= 0) {
                clearInterval(this._intervalHandle);

                this._intervalHandle = null;

                this._playCompleted();

            } else if (this._config.reminders && !(this.timeLeft % 300)) {
                this._playReminder();
            }

            this._draw();
        }, interval * 1000);
    }

    stop() {
        if (this._intervalHandle) {
            clearInterval(this._intervalHandle);

            this._intervalHandle = null;
        }
    }

    subscribe(callback, timeLeft = 0) {
        const subscription = {
            unsubscribe: () => {
                const index = this._subscriptions.find((_subscription) => _subscription === subscription);

                if (index !== -1) {
                    this._subscriptions.splice(index, 1);

                    return true;

                } else {
                    return false;
                }
            },
            get _callback() { return typeof callback === 'function' ? callback : () => { } },
            get _timeLeft() { return Math.round(timeLeft) },
        };

        this._subscriptions.push(subscription);

        return subscription;
    }

    _bootstrap() {
        const events = ['keydown', 'mousedown', 'touchstart'];

        const bootstrap = () => {
            if (!this._audioContext) {
                this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            if (this._audioContext) {
                this._audioContext.resume();

                events.forEach((event) => document.body.removeEventListener(event, bootstrap));
            }
        };

        events.forEach((event) => document.body.addEventListener(event, bootstrap));
    }

    _draw() {
        this._drawBackground();
        this._drawFace();
        this._drawTicks();
        this._drawTimeLeft();
        this._drawPanda();

        if (this._config.alterable) {
            this._drawCursor();
        }

        this._drawNumbers();
        this._drawText();
    }

    _drawBackground() {
        this._ctx.rect(0, 0, this._width, this._height);
        this._ctx.fillStyle = this._config.color.background;
        this._ctx.fill();
    }

    _drawCursor() {
        const angle = 2 * Math.PI / this._config.timeMax * (this._config.timeMax - this.timeLeft);

        this._ctx.beginPath();
        this._ctx.translate(this._centerX + this._radius * 0.8 * Math.sin(angle), this._centerY + this._radius * -0.8 * Math.cos(angle));
        this._ctx.moveTo(0, 0);
        this._ctx.rotate(angle);
        this._ctx.lineTo(this._radius * -0.1, this._radius * -0.1);
        this._ctx.arcTo(this._radius * -0.1, this._radius * -0.2, 0, this._radius * -0.2, this._radius * 0.1);
        this._ctx.arcTo(this._radius * 0.1, this._radius * -0.2, this._radius * 0.1, this._radius * -0.1, this._radius * 0.1);
        this._ctx.lineTo(0, 0);
        this._ctx.fillStyle = this._config.color.cursor;
        this._ctx.fill();
        this._ctx.rotate(-angle);
        this._ctx.translate(-this._centerX + this._radius * -0.8 * Math.sin(angle), -this._centerY + this._radius * 0.8 * Math.cos(angle));
    }

    _drawFace() {
        this._ctx.beginPath();
        this._ctx.arc(this._centerX, this._centerY, this._radius * 1.1, 0, 2 * Math.PI);
        this._ctx.fillStyle = this._config.color.face;
        this._ctx.fill();
    }

    _drawNumbers() {
        if (this._config.timeMax < 720) {
            return;
        }

        const step = this._config.timeMax / 60 / 12;

        this._ctx.font = `bold ${this._radius * (this._config.timeMax > 3600 ? 0.1 : 0.15)}px ${this._config.font}`;
        this._ctx.textBaseline = 'middle';
        this._ctx.textAlign = 'center';

        for (let i = 0; i < 12; i++) {
            const angle = i * Math.PI / -6;
            const label = `${Math.floor(i * step)}`;

            this._ctx.fillStyle = [1, 2, 6, 10, 11].includes(i) ? this._config.color.face : this._config.color.scale;

            this._ctx.translate(this._centerX, this._centerY);

            this._ctx.beginPath();
            this._ctx.rotate(angle);
            this._ctx.translate(0, this._radius * -0.925);
            this._ctx.rotate(-angle);
            this._ctx.fillText(label, 0, 0);
            this._ctx.rotate(angle);
            this._ctx.translate(0, this._radius * 0.925);
            this._ctx.rotate(-angle);

            this._ctx.translate(-this._centerX, -this._centerY);
        }
    }

    _drawPanda() {
        this._ctx.fillStyle = this._config.color.panda;

        this._ctx.translate(this._centerX, this._centerY);

        this._ctx.beginPath();
        this._ctx.rotate(-0.25 * Math.PI);
        this._ctx.arc(0, this._radius * -0.95, this._radius * 0.4, 0.875 * Math.PI, 0.125 * Math.PI);
        this._ctx.fill();
        this._ctx.rotate(0.25 * Math.PI);

        this._ctx.beginPath();
        this._ctx.rotate(0.25 * Math.PI);
        this._ctx.arc(0, this._radius * -0.95, this._radius * 0.4, 0.875 * Math.PI, 0.125 * Math.PI);
        this._ctx.fill();
        this._ctx.rotate(-0.25 * Math.PI);

        this._ctx.beginPath();
        this._ctx.ellipse(this._radius * -0.35, 0, this._radius * 0.25, this._radius * 0.4, 0.1 * Math.PI, 0, 2 * Math.PI);
        this._ctx.ellipse(this._radius * 0.35, 0, this._radius * 0.25, this._radius * 0.4, -0.1 * Math.PI, 0, 2 * Math.PI);
        this._ctx.fill();

        this._ctx.beginPath();
        this._ctx.arc(0, this._radius * 0.85, this._radius * 0.2, 1.925 * Math.PI, 1.075 * Math.PI);
        this._ctx.fill();

        this._ctx.translate(-this._centerX, -this._centerY);
    }

    _drawText() {
        this._ctx.beginPath();
        this._ctx.fillStyle = this._config.color.text;
        this._ctx.textBaseline = 'middle';
        this._ctx.textAlign = 'center';

        if (this._cursorMoving) {
            const timeLeft = this.timeLeft;

            const hours = this._config.timeMax >= 3600 ? `${Math.floor(timeLeft / 3600)}h` : '';
            const minutes = `${Math.floor(timeLeft % 3600 / 60)}m`.replace(/^([0-9]m)/, '0$1');
            const seconds = `${timeLeft % 60}s`.replace(/^([0-9]s)/, '0$1');

            this._ctx.font = `${this._radius * 0.06}px monospace`;

            this._ctx.fillText(`${hours} ${minutes} ${seconds}`, this._centerX, this._centerY + this._radius * 0.45);

        } else {
            this._ctx.font = `${this._radius * 0.05}px ${this._config.font}`;

            if (this._config.text.line1 && this._config.text.line2) {

                this._ctx.fillText(this._config.text.line1, this._centerX, this._centerY + this._radius * 0.425);
                this._ctx.fillText(this._config.text.line2, this._centerX, this._centerY + this._radius * 0.475);

            } else {
                this._ctx.fillText(this._config.text.line1 || this._config.text.line2, this._centerX, this._centerY + this._radius * 0.45);
            }
        }
    }

    _drawTicks() {
        for (let i = 0; i < 30; i++) {
            const angle = i * Math.PI / 30;
            const tickBegin = this._radius * (i % 5 ? 0.7 : 0.6);
            const tickEnd = this._radius * 0.8;
            const width = i % 5 ? 1 : 3;

            this._ctx.translate(this._centerX, this._centerY);

            this._ctx.beginPath();
            this._ctx.moveTo(0, 0);
            this._ctx.rotate(angle);
            this._ctx.moveTo(0, tickBegin);
            this._ctx.lineTo(0, tickEnd);
            this._ctx.moveTo(0, -tickBegin);
            this._ctx.lineTo(0, -tickEnd);
            this._ctx.lineWidth = width;
            this._ctx.strokeStyle = this._config.color.scale;
            this._ctx.stroke();
            this._ctx.rotate(-angle);

            this._ctx.translate(-this._centerX, -this._centerY);
        }
    }

    _drawTimeLeft() {
        const angle = 2 * Math.PI / this._config.timeMax * (this._config.timeMax - this.timeLeft) - 0.5 * Math.PI;

        this._ctx.translate(this._centerX, this._centerY);

        this._ctx.fillStyle = this._config.color.timer;

        this._ctx.beginPath();
        this._ctx.moveTo(0, 0);
        this._ctx.arc(0, 0, this._radius * 0.8, angle, 1.5 * Math.PI);
        this._ctx.lineTo(0, 0);
        this._ctx.fill();

        this._ctx.beginPath();
        this._ctx.arc(0, 0, this._radius * 0.025, 0, 2 * Math.PI);
        this._ctx.shadowBlur = this._radius * 0.01;
        this._ctx.shadowColor = '#333';
        this._ctx.fill();
        this._ctx.shadowBlur = 0;

        this._ctx.translate(-this._centerX, -this._centerY);
    }

    _onMove(event) {
        if (!this._cursorMoving) {
            return;
        }

        const pageX = event.touches ? event.touches[0].pageX : event.pageX;
        const pageY = event.touches ? event.touches[0].pageY : event.pageY;

        const x = pageX - (event.target.clientLeft + event.target.offsetLeft) - this._centerX;
        const y = pageY - (event.target.clientTop + event.target.offsetTop) - this._centerY;

        let angle = Math.atan2(y, x) + 0.5 * Math.PI;

        if (angle < 0) {
            angle += 2 * Math.PI
        }

        let timeLeft = Math.round(this._config.timeMax - (this._config.timeMax / (2 * Math.PI) * angle));

        if (this._config.indexed) {
            const tick = this._config.timeMax / 60;

            timeLeft = Math.round(timeLeft / tick) * tick;
        }

        if (Math.abs(timeLeft - this._cursorPrevious) < this._config.timeMax / 2) {
            this._cursorPrevious = timeLeft;

            this.setTimeLeft(timeLeft);
        }
    }

    _onRelease() {
        if (!this._cursorMoving) {
            return;
        }

        this._cursorMoving = false;

        this._draw();

        if (this.timeLeft) {
            if (this._config.autostart) {
                this.start();
            }

        } else {
            this._playCompleted();
        }
    }

    _onTouch(event) {
        const angle = 2 * Math.PI / this._config.timeMax * (this._config.timeMax - this.timeLeft) - 0.5 * Math.PI;

        const cx = this._centerX + this._radius * 0.925 * Math.cos(angle);
        const cy = this._centerY + this._radius * 0.925 * Math.sin(angle);

        const pageX = event.touches ? event.touches[0].pageX : event.pageX;
        const pageY = event.touches ? event.touches[0].pageY : event.pageY;

        const x = pageX - (event.target.clientLeft + event.target.offsetLeft);
        const y = pageY - (event.target.clientTop + event.target.offsetTop);

        this._cursorMoving = Math.sqrt((cx - x) ** 2 + (cy - y) ** 2) <= this._radius * 0.15;

        if (this._cursorMoving) {
            event.preventDefault();

            this._cursorPrevious = this.timeLeft;

            this.stop();
        }
    }

    _playCompleted() {
        if (this._audioContext && !this._audioContextBusy) {
            this._audioContext.resume().then(() => {
                const gn = this._audioContext.createGain();
                const osc1 = this._audioContext.createOscillator();
                const osc2 = this._audioContext.createOscillator();

                this._audioContextBusy = true;

                gn.gain.value = 1;
                gn.connect(this._audioContext.destination);

                osc1.frequency.value = 2050;
                osc1.connect(gn);
                osc1.start(this._audioContext.currentTime);
                osc1.stop(this._audioContext.currentTime + 0.125);

                osc2.frequency.value = 2050;
                osc2.connect(gn);
                osc2.start(this._audioContext.currentTime + 0.25);
                osc2.stop(this._audioContext.currentTime + 0.35);

                osc2.onended = () => this._audioContextBusy = false;
            });
        }
    }

    _playReminder() {
        if (this._audioContext && !this._audioContextBusy) {
            this._audioContext.resume().then(() => {
                const osc = this._audioContext.createOscillator();
                const gn = this._audioContext.createGain();

                this._audioContextBusy = true;

                gn.gain.value = 0.5;
                gn.connect(this._audioContext.destination);

                osc.frequency.value = 1850;
                osc.connect(gn);
                osc.start(this._audioContext.currentTime);
                osc.stop(this._audioContext.currentTime + 0.125);

                osc.onended = () => this._audioContextBusy = false;
            });
        }
    }

    _resize() {
        if (this._responsive) {
            this._canvas.height = this._canvas.width = Math.min(this._canvas.parentElement.clientHeight, this._canvas.parentElement.clientWidth);
        }
    }

    _tick() {
        const timeLeft = this.timeLeft;

        this._subscriptions.forEach((subscription) => {
            if (timeLeft === subscription._timeLeft) {
                subscription._callback(timeLeft);
            }
        });
    }
}

PandaTimer.defaultConfig = {
    alterable: true,
    autostart: true,
    color: {
        background: '#fff',
        cursor: 'rgba(255, 0, 0, 0.3)',
        face: '#fff',
        panda: '#333',
        scale: '#333',
        text: '#333',
        timer: '#f00',
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

if (window !== undefined) {
    window.PandaTimer = PandaTimer;
}
