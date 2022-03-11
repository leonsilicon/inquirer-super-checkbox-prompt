/* eslint-disable @typescript-eslint/no-unnecessary-qualifier */
/* eslint-disable unicorn/no-array-for-each */

import type { Interface } from 'node:readline';
import _ from 'lodash';
import chalk from 'chalk';
import { map, takeUntil } from 'rxjs';
import cliCursor from 'cli-cursor';
import figures from 'figures';
import Base from 'inquirer/lib/prompts/base.js';
import Choices from 'inquirer/lib/objects/choices.js';
import observe from 'inquirer/lib/utils/events.js';
import Paginator from 'inquirer/lib/utils/paginator.js';
import type {
	Answers,
	Question,
	CheckboxChoiceOptions,
	AllChoiceMap,
} from 'inquirer';
import type inquirer from 'inquirer';
import type Choice from 'inquirer/lib/objects/choice.js';
import type { KeyDescriptor } from '~/types.js';

declare module 'inquirer' {
	interface SuperCheckboxPromptOptions<
		T extends inquirer.Answers = inquirer.Answers
	> extends inquirer.InputQuestionOptions<T> {}

	/**
	 * Provides options for the `PressToContinuePrompt`.
	 *
	 * @template T
	 * The type of the answers.
	 */

	interface SuperCheckboxPrompt<T extends inquirer.Answers = inquirer.Answers>
		extends SuperCheckboxPromptOptions<T> {
		/**
		@inheritdoc
		*/
		type: 'super-checkbox';

		/**
		Whether the current choice should be highlighted.
		*/
		highlight?: boolean;

		/**
		Whether the checkbox list should be searchable
		*/
		searchable?: boolean;
		/**
		The choices that should be checked at the start.
		*/
		defaults?: string[];

		/**
		The number of choices shown on one page
		*/
		pageSize?: number;

		/**
		An array of choices or a function returning an array of choices.
		 */
		source:
			| inquirer.DistinctChoice[]
			| ((
					answers: inquirer.Answers,
					line: string | undefined
			  ) => Promise<inquirer.DistinctChoice[]> | inquirer.DistinctChoice[]);
	}

	interface QuestionMap<T extends inquirer.Answers = inquirer.Answers> {
		/**
		 * The `PressToContinuePrompt` type.
		 */
		superCheckbox: SuperCheckboxPrompt<T>;
	}
}

type DistinctChoice<T = Answers> = AllChoiceMap<T>[keyof AllChoiceMap<T>];

class SuperCheckboxPrompt extends Base {
	declare opt: inquirer.prompts.PromptOptions & {
		highlight: boolean;
		searchable: boolean;
		defaults: string[];
		pageSize: number;
		source:
			| DistinctChoice[]
			| ((
					answers: Answers,
					line: string | undefined
			  ) => Promise<DistinctChoice[]> | DistinctChoice[]);
	};

	pointer: number;
	firstSourceLoading: boolean;
	choices: Choices;
	checkedChoices: CheckboxChoiceOptions[];
	searching: boolean;
	value: Choice[];
	selection: string[];
	lastQuery: string | undefined;
	defaults: string[] | undefined;
	paginator: Paginator;
	searchInput: string;
	lastSourcePromise: Promise<DistinctChoice[]> | undefined;
	done: (value: any) => void;

	constructor(questions: Question, rl: Interface, answers: Answers) {
		super(questions, rl, answers);

		this.opt.highlight = this.opt.highlight ?? false;
		this.opt.searchable = this.opt.searchable ?? false;

		// Doesn't have source option
		if (this.opt.source === undefined) {
			this.throwParamError('source');
		}

		// Init
		this.pointer = 0;
		this.firstSourceLoading = true;
		this.choices = new Choices([], answers);
		this.checkedChoices = [];
		this.value = [];
		this.lastQuery = undefined;
		this.searching = false;
		this.lastSourcePromise = undefined;
		this.defaults = this.opt.defaults;

		this.paginator = new Paginator(this.screen);
	}

	async _getChoices(
		answers: Answers,
		line?: string
	): Promise<DistinctChoice[]> {
		if (Array.isArray(this.opt.source)) {
			// Use a default filter
			return this.opt.source.filter((choice) => {
				const value = (choice as CheckboxChoiceOptions).value as string;
				return line?.toLowerCase().includes(value);
			});
		} else {
			return this.opt.source(answers, line);
		}
	}

	/**
	Start the Inquirer.js session
	*/
	_run(callback: (value: any) => void) {
		this.done = callback;

		this.executeSource()
			.then(() => {
				const events = observe(this.rl);

				const validation = this.handleSubmitEvents(
					events.line.pipe(map(this.getCurrentValue.bind(this)))
				);

				void validation.success.forEach(this.onEnd.bind(this));
				void validation.error.forEach(this.onError.bind(this));

				void events.normalizedUpKey
					.pipe(takeUntil(validation.success))
					.forEach(this.onUpKey.bind(this));

				void events.normalizedDownKey
					.pipe(takeUntil(validation.success))
					.forEach(this.onDownKey.bind(this));

				void events.keypress
					.pipe(takeUntil(validation.success))
					.forEach(this.onKeypress.bind(this));

				void events.spaceKey
					.pipe(takeUntil(validation.success))
					.forEach(this.onSpaceKey.bind(this));

				// If the search is enabled
				if (this.opt.searchable) {
					void events.keypress
						.pipe(takeUntil(validation.success))
						.forEach(this.onKeypress.bind(this));
				} else {
					void events.numberKey
						.pipe(takeUntil(validation.success))
						.forEach(this.onNumberKey.bind(this));
					void events.aKey
						.pipe(takeUntil(validation.success))
						.forEach(this.onAllKey.bind(this));
					void events.iKey
						.pipe(takeUntil(validation.success))
						.forEach(this.onInverseKey.bind(this));
				}

				if (this.rl.line) {
					this.onKeypress();
				}

				// Init the prompt
				cliCursor.hide();
				this.render();
			})
			.catch((error) => {
				this.onError({ isValid: String(error) });
			});
	}

	/**
	 * Execute the source function to get the choices and render them
	 */
	async executeSource() {
		let sourcePromise: Promise<DistinctChoice[]> | undefined;

		// Remove spaces
		const line = this.rl.line.trim();
		this.searchInput = this.rl.line;

		// Same last search query that already loaded
		if (line === this.lastQuery) {
			return;
		}

		// If the search is enabled
		if (this.opt.searchable) {
			sourcePromise = this._getChoices(this.answers, line);
		} else {
			sourcePromise = this._getChoices(this.answers, undefined);
		}

		this.lastQuery = line;
		this.lastSourcePromise = sourcePromise;
		this.searching = true;

		sourcePromise
			.then((choices) => {
				// Is not the last issued promise
				if (this.lastSourcePromise !== sourcePromise) {
					return;
				}

				// Reset the searching status
				this.searching = false;

				// Save the new choices
				this.choices = new Choices(choices, this.answers);

				// Foreach choice
				this.choices.forEach((choice) => {
					const checkboxChoice = choice as CheckboxChoiceOptions;
					// Is the current choice included in the current checked choices
					if (this.value.includes(checkboxChoice.value)) {
						this.toggleChoice(checkboxChoice, true);
					} else {
						this.toggleChoice(checkboxChoice, false);
					}

					// Is the current choice included in the default values
					if (this.defaults?.includes(checkboxChoice.value)) {
						this.toggleChoice(checkboxChoice, true);
					}
				});

				// Reset the pointer to select the first choice
				this.pointer = 0;
				this.render();
				this.defaults = undefined;
			})
			.catch((error) => {
				this.onError({ isValid: String(error) });
			});

		return sourcePromise;
	}

	/**
	 * Render the prompt
	 */
	render(error?: string | boolean) {
		// Render question
		let message = this.getQuestion();
		let bottomContent = '';

		// Answered
		if (this.status === 'answered') {
			message += chalk.cyan(this.selection.join(', '));
			this.screen.render(message, bottomContent);
			return;
		}

		// No search query is entered before
		if (this.firstSourceLoading) {
			// If the search is enabled
			if (this.opt.searchable) {
				message +=
					'(Press ' +
					chalk.cyan.bold('<space>') +
					' to select, ' +
					'or type anything to filter the list)';
			} else {
				message +=
					'(Press ' +
					chalk.cyan.bold('<space>') +
					' to select, ' +
					chalk.cyan.bold('<a>') +
					' to toggle all, ' +
					chalk.cyan.bold('<i>') +
					' to invert selection)';
			}
		}

		// If the search is enabled
		if (this.opt.searchable) {
			// Print the current search query
			message += this.searchInput;
		}

		// Searching mode
		if (this.searching) {
			message += '\n  ' + chalk.cyan('Searching...');

			// No choices
		} else if (this.choices.length === 0) {
			message += '\n  ' + chalk.yellow('No results...');

			// Has choices
		} else {
			const choicesStr = this.renderChoices(this.choices, this.pointer);

			const indexPosition = this.choices.indexOf(
				this.choices.getChoice(this.pointer) as Choice
			);

			message +=
				'\n' +
				this.paginator.paginate(choicesStr, indexPosition, this.opt.pageSize);
		}

		if (error) {
			bottomContent = chalk.red('>> ') + String(error);
		}

		this.screen.render(message, bottomContent);
	}

	/**
	Called when the user presses `Enter` key
	*/
	onEnd(state: { value: any }) {
		this.status = 'answered';

		// Rerender prompt (and clean subline error)
		this.render();

		this.screen.done();
		cliCursor.show();
		this.done(state.value);
	}

	/**
	Called when an error occurs.
	*/
	onError(state: { isValid: string | false }) {
		this.render(state.isValid);
	}

	/**
	Get the current values of the selected choices
	*/
	getCurrentValue() {
		this.selection = this.checkedChoices.map((choice) => choice.short!);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return this.checkedChoices.map((choice) => choice.value);
	}

	/**
	 * A callback function for the event:
	 * When the user press `Up` key
	 */
	onUpKey() {
		const len = this.choices.realLength;
		this.pointer = this.pointer > 0 ? this.pointer - 1 : len - 1;
		this.render();
	}

	/**
	 * A callback function for the event:
	 * When the user press `Down` key
	 */
	onDownKey() {
		const len = this.choices.realLength;
		this.pointer = this.pointer < len - 1 ? this.pointer + 1 : 0;
		this.render();
	}

	/**
	A callback function for the event:
	When the user press a number key
	*/
	onNumberKey(input: KeyDescriptor) {
		const value = Number(input.value);
		if (value <= this.choices.realLength) {
			this.pointer = value - 1;
			this.toggleChoice(this.choices.getChoice(this.pointer));
		}

		this.render();
	}

	/**
	 * A callback function for the event:
	 * When the user press `Space` key
	 */
	onSpaceKey() {
		// When called no results
		if (!this.choices.getChoice(this.pointer)) {
			return;
		}

		this.toggleChoice(this.choices.getChoice(this.pointer));
		this.render();
	}

	/**
	 * A callback function for the event:
	 * When the user press 'a' key
	 */
	onAllKey() {
		const shouldBeChecked = Boolean(
			// eslint-disable-next-line unicorn/prefer-array-some
			this.choices.find(
				(choice) => choice.type !== 'separator' && !choice.checked
			)
		);

		this.choices.forEach((choice) => {
			if (choice.type !== 'separator') {
				choice.checked = shouldBeChecked;
			}
		});

		this.render();
	}

	/**
	 * A callback function for the event:
	 * When the user press `i` key
	 */
	onInverseKey() {
		this.choices.forEach((choice) => {
			if (choice.type !== 'separator') {
				choice.checked = !choice.checked;
			}
		});

		this.render();
	}

	/**
	 * A callback function for the event:
	 * When the user press any key
	 */
	onKeypress() {
		this.firstSourceLoading = false;
		this.executeSource().catch((error) => {
			this.onError({ isValid: String(error) });
		});
		this.render();
	}

	/**
	Toggle (check/uncheck) a specific choice
	@param checked if not specified the status will be toggled
	*/
	toggleChoice(choice: CheckboxChoiceOptions, checked?: boolean) {
		// Default value for checked
		if (typeof checked === 'undefined') {
			checked = !choice.checked;
		}

		// Remove the choice's value from the checked values
		this.value.splice(this.value.indexOf(choice.value), 1);

		// Remove the checkedChoices with the value of the current choice
		this.checkedChoices.splice(
			this.checkedChoices.findIndex(
				(checkedChoice) => choice.value === checkedChoice.value
			),
			1
		);

		choice.checked = false;

		// Is the choice checked
		if (checked) {
			this.value.push(choice.value);
			this.checkedChoices.push(choice);
			choice.checked = true;
		}
	}

	/**
	Get the checkbox figure (sign)
	*/
	getCheckboxFigure(checked: boolean | undefined): string {
		return checked ? chalk.green(figures.radioOn) : figures.radioOff;
	}

	/**
	Render the checkbox choices

	@param choices
	@param pointer the position of the pointer
	@return rendered content
	*/
	renderChoices(choices: Choices, pointer: number) {
		let output = '';
		let separatorOffset = 0;

		choices.forEach((choice, index) => {
			// Is a separator
			if (choice.type === 'separator') {
				separatorOffset += 1;
				output += ' ' + choice.line + '\n';
				return;
			}

			// Is the choice disabled
			if (choice.disabled) {
				separatorOffset++;
				output += ' - ' + choice.name;
				output +=
					' (' +
					(typeof choice.disabled === 'string' ? choice.disabled : 'Disabled') +
					')';
				output += '\n';
				return;
			}

			// Is the current choice is the selected choice
			if (index - separatorOffset === pointer) {
				output += chalk.cyan(figures.pointer);
				output += this.getCheckboxFigure(choice.checked) + ' ';
				output += this.opt.highlight ? chalk.gray(choice.name) : choice.name;
			} else {
				output +=
					' ' + this.getCheckboxFigure(choice.checked) + ' ' + choice.name;
			}

			output += '\n';
		});

		return output.replace(/\n$/, '');
	}
}

export default SuperCheckboxPrompt;
