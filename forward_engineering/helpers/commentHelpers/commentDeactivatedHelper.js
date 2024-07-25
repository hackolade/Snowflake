const _ = require('lodash');

const MULTILINE_COMMENT = /(\n\/\*\n[\s\S]*?\n\s\*\/\n)|(\n\/\*\n[\s\S]*?\n\s\*\/)$/gi;
const STARTS_QUERY = ['//', '--'];

const commentIfDeactivated = (statement, data, isPartOfLine) => {
	if (_.has(data, 'isActivated') && !data.isActivated) {
		if (isPartOfLine) {
			return '// ' + statement;
		} else if (statement.includes('\n')) {
			return statement
				.split('\n')
				.filter(line => line.trim())
				.map(line => '// ' + line)
				.join('\n');
		}
	}

	return statement;
};

const filterDeactivatedQuery = query => query.replace(MULTILINE_COMMENT, '');

const queryIsDeactivated = (query = '') => STARTS_QUERY.some(startQuery => query.startsWith(startQuery));

module.exports = {
	commentIfDeactivated,
	filterDeactivatedQuery,
	queryIsDeactivated,
};
