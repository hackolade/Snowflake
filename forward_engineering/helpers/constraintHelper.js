module.exports = _ => {
	const { foreignKeysToString, foreignActiveKeysToString, getName } =
		require('./general')(_);

	const generateConstraint = ({
		name,
		keys,
		keyType,
		isParentActivated,
		isCaseSensitive,
	}) => {
		const keysAsStrings = keys.map(key =>
			Object.assign({}, key, { name: `${getName(isCaseSensitive, key.name)}` })
		);
		const atLeastOneActive = keysAsStrings.some(key => key.isActivated);
		let finalStringOfKeys = foreignActiveKeysToString(
			isCaseSensitive,
			keysAsStrings
		);
		if (atLeastOneActive && isParentActivated) {
			finalStringOfKeys = foreignKeysToString(isCaseSensitive, keysAsStrings);
		}
		return {
			statement: (name !== 'undefined' ? `CONSTRAINT ${getName(
				isCaseSensitive,
				name
			)} ` : '') + `${keyType} (${finalStringOfKeys})`,
			isActivated: atLeastOneActive,
		};
	};
	
	return generateConstraint;
};
