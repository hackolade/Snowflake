const { getModifyKeyScripts } = require('./sharedKeyConstraintHelper');

/**
 * Primary Key constraint configuration
 */
const PRIMARY_KEY_CONFIG = {
	constraintType: 'PRIMARY KEY',
	compModKeyName: 'primaryKey',
	columnKeyProperty: 'primaryKey',
	compositeKeyProperty: 'compositePrimaryKey',
	constraintNameProperty: 'primaryKeyConstraintName',
};

/**
 * Get all modify PK scripts (both composite and regular)
 *
 * @param {AlterCollectionDto} collection
 * @param {string} scriptFormat
 * @return {AlterScriptDto[]}
 * */
const getModifyPkScripts = (collection, scriptFormat) => {
	return getModifyKeyScripts(collection, PRIMARY_KEY_CONFIG, scriptFormat);
};

module.exports = {
	getModifyPkScripts,
};
