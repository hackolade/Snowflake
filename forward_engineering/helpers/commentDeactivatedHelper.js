const MULTILINE_COMMENT = /(\n\/\*\n[\s\S]*?\n\s\*\/\n)|(\n\/\*\n[\s\S]*?\n\s\*\/)$/gi;
const STARTS_QUERY = ['//', '--'];

module.exports = (_) => {
	const commentIfDeactivated = (statement, data, isPartOfLine) => {
		if (_.has(data, 'isActivated') && !data.isActivated) {
			if (isPartOfLine) {
				return '/* ' + statement + ' */';
			} else if (statement.includes('\n')) {
				return '/*\n' + statement + ' */\n';
			} else {
				return '// ' + statement;
			}
		}
		return statement;
	};

	const filterDeactivatedQuery = query => query.replace(MULTILINE_COMMENT, '');

	const queryIsDeactivated = (query = '') => STARTS_QUERY.some(startQuery => query.startsWith(startQuery));

	return {
		commentIfDeactivated,
		filterDeactivatedQuery,
		queryIsDeactivated
	};
};
