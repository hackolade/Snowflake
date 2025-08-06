const _ = require('lodash');

const getAccountName = account => _.toUpper(_.first(account.split('.')));
const getRole = role => {
	if (!_.isString(role)) {
		return role;
	}

	if (_.first(role) === '"' && _.last(role) === '"') {
		return role;
	}

	if (/^[a-z][a-z\d]*$/i.test(role)) {
		return role;
	}

	return `"${role}"`;
};

const removeQuotes = str => {
	return (str || '').replace(/^"([\s\S]*)"$/im, '$1');
};

module.exports = {
	getAccountName,
	getRole,
	removeQuotes,
};
