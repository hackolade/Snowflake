const _ = require('lodash');

const STARTS_QUERY = ['//'];

const commentIfDeactivated = (statement, data, isPartOfLine) => {
	if (_.has(data, 'isActivated') && !data.isActivated) {
		if (isPartOfLine) {
			return '// ' + statement;
		} else if (statement.includes('\n')) {
			return statement
				.split('\n')
				.filter(Boolean)
				.map(line => '// ' + line)
				.join('\n')
				.concat('\n');
		}

		return !statement ? '' : '// ' + statement;
	}

	return statement;
};

const queryIsDeactivated = (query = '') => STARTS_QUERY.some(startQuery => query.startsWith(startQuery));

module.exports = {
	commentIfDeactivated,
	queryIsDeactivated,
};
