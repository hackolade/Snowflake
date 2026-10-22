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
 * @param {string} scriptFormat
 * @return {AlterScriptDto[]}
 * */
const getModifyUkScripts = (collection, scriptFormat) => {
	return getModifyKeyScripts(collection, UNIQUE_KEY_CONFIG, scriptFormat);
};

module.exports = {
	getModifyUkScripts,
};
