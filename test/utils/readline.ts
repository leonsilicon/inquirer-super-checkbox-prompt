import type { EventEmitter } from 'node:events';
import { Interface } from 'node:readline';
import { Duplex } from 'node:stream';
import { vi } from 'vitest';

export class ReadlineStub extends Interface {
	line: string;
	input: EventEmitter;

	constructor() {
		const input = new Duplex({
			read() {
				/* noop */
			},
		});
		super(input);

		this.line = '';
		this.input = input;

		Object.assign(this, {
			write: vi.fn().mockReturnThis(),
			moveCursor: vi.fn().mockReturnThis(),
			setPrompt: vi.fn().mockReturnThis(),
			close: vi.fn().mockReturnThis(),
			pause: vi.fn().mockReturnThis(),
			resume: vi.fn().mockReturnThis(),
			_getCursorPos: vi.fn().mockReturnValue({
				cols: 0,
				rows: 0,
			}),
			output: {
				end: vi.fn().mockReturnThis(),
				mute: vi.fn().mockReturnThis(),
				unmute: vi.fn().mockReturnThis(),
				__raw__: '',
				write(str: string) {
					this.__raw__ += str;
				},
			},
		});
	}

	type(word: string) {
		for (const char of word) {
			this.line += char;
			this.input.emit('keypress', char);
		}
	}

	moveDown() {
		this.input.emit('keypress', '', {
			name: 'down',
		});
	}

	moveUp() {
		this.input.emit('keypress', '', {
			name: 'up',
		});
	}

	enter() {
		this.emit('line');
	}

	space() {
		this.input.emit('keypress', '', {
			name: 'space',
		});
	}

	tab() {
		this.input.emit('keypress', '', {
			name: 'tab',
		});
	}

	typeNonChar() {
		this.input.emit('keypress', '', {
			name: 'shift',
		});
	}
}
