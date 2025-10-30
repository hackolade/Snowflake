const { getModifyKeyScripts } = require('./sharedKeyConstraintHelper');

/**
 * Unique Key constraint configuration
 */
const UNIQUE_KEY_CONFIG = {
	constraintType: 'UNIQUE',
	compModKeyName: 'uniqueKey',
	columnKeyProperty: 'unique',
	compositeKeyProperty: 'compositeUniqueKey',
	constraintNameProperty: 'uniqueKeyConstraintName',
};

/**
 * Get all modify UK scripts (both composite and regular)
 *
 * @param {AlterCollectionDto} collection
 * @return {AlterScriptDto[]}
 * */
const getModifyUkScripts = collection => {
	return getModifyKeyScripts(collection, UNIQUE_KEY_CONFIG);
};

module.exports = {
	getModifyUkScripts,
};
