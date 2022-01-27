module.exports = _ => {
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
	return commentIfDeactivated
}
