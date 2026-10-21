const { foreignKeysToString, foreignActiveKeysToString, getName } = require('./general');
const { escapeString } = require('../utils/escapeString');

/**
 * @param {{
 *     name: string,
 *     keys: Array<{ name: string, isActivated: boolean }>,
 *     keyType: string,
 *     isParentActivated: boolean,
 *     isCaseSensitive?: boolean,
 *     comment?: string,
 *     scriptFormat?: string,
 * }}
 * @return {{ statement: string, isActivated: boolean }}
 */
const generateConstraint = ({ name, keys, keyType, isParentActivated, isCaseSensitive, comment, scriptFormat }) => {
	const keysAsStrings = keys.map(key => ({ ...key, name: `${getName(isCaseSensitive, key.name)}` }));
	const atLeastOneActive = keysAsStrings.some(key => key.isActivated);
	let finalStringOfKeys = foreignActiveKeysToString(isCaseSensitive, keysAsStrings);
	if (atLeastOneActive && isParentActivated) {
		finalStringOfKeys = foreignKeysToString(isCaseSensitive, keysAsStrings);
	}

	const constraintName = name && name !== 'undefined' ? `CONSTRAINT ${getName(isCaseSensitive, name)} ` : '';

	const commentStatement = comment ? ` COMMENT ${escapeString(scriptFormat, comment)}` : '';

	return {
		statement: constraintName + `${keyType} (${finalStringOfKeys})` + commentStatement,
		isActivated: atLeastOneActive,
	};
};

module.exports = {
	generateConstraint,
};
