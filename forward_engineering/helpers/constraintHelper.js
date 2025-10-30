const { foreignKeysToString, foreignActiveKeysToString, getName } = require('./general');

const generateConstraint = ({ name, keys, keyType, isParentActivated, isCaseSensitive }) => {
	const keysAsStrings = keys.map(key => ({ ...key, name: `${getName(isCaseSensitive, key.name)}` }));
	const atLeastOneActive = keysAsStrings.some(key => key.isActivated);
	let finalStringOfKeys = foreignActiveKeysToString(isCaseSensitive, keysAsStrings);
	if (atLeastOneActive && isParentActivated) {
		finalStringOfKeys = foreignKeysToString(isCaseSensitive, keysAsStrings);
	}

	const contraintName = name && name !== 'undefined' ? `CONSTRAINT ${getName(isCaseSensitive, name)} ` : '';

	return {
		statement: contraintName + `${keyType} (${finalStringOfKeys})`,
		isActivated: atLeastOneActive,
	};
};

module.exports = {
	generateConstraint,
};
