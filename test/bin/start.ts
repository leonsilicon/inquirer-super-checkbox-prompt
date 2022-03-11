import inquirer from 'inquirer';
import SuperCheckboxPrompt from '~/prompt.js';

inquirer.registerPrompt('super-checkbox', SuperCheckboxPrompt);
await inquirer.prompt({
	type: 'super-checkbox',
	message: 'Select a choice',
	searchable: true,
	name: 'choice',
	source: ['Choice 1', 'Choice 2', 'Choice 3'],
});
