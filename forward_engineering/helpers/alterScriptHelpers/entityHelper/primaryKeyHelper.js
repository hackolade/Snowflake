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
 * @return {AlterScriptDto[]}
 * */
const getModifyPkScripts = collection => {
	return getModifyKeyScripts(collection, PRIMARY_KEY_CONFIG);
};

module.exports = {
	getModifyPkScripts,
};
