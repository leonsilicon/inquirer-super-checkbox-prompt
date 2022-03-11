/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import type { Question, QuestionCollection } from 'inquirer';
import inquirer from 'inquirer';
import { describe, it, expect } from 'vitest';
import { ReadlineStub } from '~test/utils/readline.js';
import SuperCheckboxPrompt from '~/index.js';

describe('inquirer-autocomplete-prompt', () => {
	describe('Pass a choices', () => {
		const createPrompt = (questions: QuestionCollection) => {
			const rl = new ReadlineStub();
			const prompt = new SuperCheckboxPrompt(questions as Question, rl, []);
			return { prompt, rl };
		};

		const defaultSource = ['foo', new inquirer.Separator(), 'bar', 'baz'];

		it('applies choices', async () => {
			const { prompt, rl } = createPrompt({
				message: 'test',
				name: 'name',
				source: defaultSource,
			});

			const run = prompt.run();

			rl.moveDown();
			rl.moveDown();
			rl.space();
			rl.enter();

			const answer = await run;

			expect(answer).to.have.lengthOf(1).to.include.members(['bar']);
		});

		it('applies choices with default', async () => {
			const { prompt, rl } = createPrompt({
				message: 'test',
				name: 'name',
				source: defaultSource,
				default: ['bar'],
			});

			const run = prompt.run();
			rl.space();
			rl.enter();

			const answer = await run;
			expect(answer).to.have.lengthOf(2).to.include.members(['foo', 'bar']);
		});

		it('applies validate', async () => {
			const { prompt, rl } = createPrompt({
				message: 'test',
				name: 'name',
				source: defaultSource,
				validate(answer) {
					if (answer.length === 0) {
						return 'You must choose at least one topping.';
					} else {
						return true;
					}
				},
			});

			const run = prompt.run();
			rl.enter();
			rl.space();
			rl.enter();

			const answer = await run;
			expect(answer).to.have.lengthOf(1).to.include.members(['foo']);
		});

		it('searching', async () => {
			const { prompt, rl } = createPrompt({
				message: 'test',
				name: 'name',
				source: defaultSource,
			});
			const run = prompt.run();

			rl.type('um');
			rl.space();

			rl.line = '';

			rl.type('ba');
			rl.space();
			rl.enter();

			const answer = await run;

			expect(answer).to.have.lengthOf(2).to.include.members(['bum', 'bar']);
		});

		it('when tab pressed', async () => {
			const { prompt, rl } = createPrompt({
				message: 'test',
				name: 'name',
				source: defaultSource,
			});

			const run = prompt.run();

			rl.tab();
			rl.space();
			rl.enter();

			const answer = await run;
			expect(answer).to.have.lengthOf(1).to.include.members(['foo']);
		});

		it('cancel default value', async () => {
			const { prompt, rl } = createPrompt({
				message: 'test',
				name: 'name',
				source: defaultSource,
				default: ['bar'],
			});

			const run = prompt.run();

			rl.type('ba');
			rl.space();
			rl.enter();

			const answer = await run;

			expect(answer).to.be.an('array').to.have.lengthOf(0);
		});

		it('loops choices going down', async () => {
			const { prompt, rl } = createPrompt({
				message: 'test',
				name: 'name',
				source: ['foo', new inquirer.Separator(), 'bar', 'bum'],
			});

			const run = prompt.run();

			rl.moveDown();
			rl.moveDown();
			rl.moveDown();
			rl.moveDown();
			rl.space();
			rl.enter();

			const answer = await run;

			expect(answer).to.have.lengthOf(1).to.include.members(['foo']);
		});

		it('requires a name', () => {
			expect(() => {
				createPrompt({
					message: 'foo',
					source: defaultSource,
				});
			}).to.throw(/name/);
		});

		it('requires source', () => {
			expect(() => {
				createPrompt({
					name: 'foo',
					message: 'foo',
				});
			}).to.throw(/choices/);
		});
	});
	// TODO: add tests where source is a function
});
