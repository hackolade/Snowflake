/*
 * Copyright © 2016-2023 by IntegrIT S.A. dba Hackolade.  All rights reserved.
 *
 * The copyright to the computer software herein is the property of IntegrIT S.A.
 * The software may be used and/or copied only with the written permission of
 * IntegrIT S.A. or in accordance with the terms and conditions stipulated in
 * the agreement/contract under which the software has been supplied.
 */

module.exports = (_, app) => {
	const { foreignKeysToString, foreignActiveKeysToString, getName } = require('./general')(_, app);

	const generateConstraint = ({ name, keys, keyType, isParentActivated, isCaseSensitive }) => {
		const keysAsStrings = keys.map(key => Object.assign({}, key, { name: `${getName(isCaseSensitive, key.name)}` }));
		const atLeastOneActive = keysAsStrings.some(key => key.isActivated);
		let finalStringOfKeys = foreignActiveKeysToString(isCaseSensitive, keysAsStrings);
		if (atLeastOneActive && isParentActivated) {
			finalStringOfKeys = foreignKeysToString(isCaseSensitive, keysAsStrings);
		}
		return {
			statement:
				(name !== 'undefined' ? `CONSTRAINT ${getName(isCaseSensitive, name)} ` : '') +
				`${keyType} (${finalStringOfKeys})`,
			isActivated: atLeastOneActive,
		};
	};

	return {
		generateConstraint
	}
};
