import inquirer from 'inquirer';
import AutocompleteCheckboxPrompt from '~/prompt.js';

inquirer.registerPrompt('autocomplete-checkbox', AutocompleteCheckboxPrompt);
await inquirer.prompt({
	name: 'key',
	pressToContinueMessage: 'Press y to continue...',
	type: '',
	anyKey: true,
});
