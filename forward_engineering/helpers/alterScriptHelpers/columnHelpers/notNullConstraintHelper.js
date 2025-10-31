const _ = require('lodash');
const { AlterScriptDto } = require('../../types/AlterScriptDto');
const { getName, isObjectInDeltaModelActivated, isParentContainerActivated } = require('../../general');
const assignTemplates = require('../../../utils/assignTemplates');
const templates = require('../../../configs/templates');

/**
 * Get NOT NULL constraint modification script DTOs
 * @param {Object} collection
 * @param {string} fullTableName
 * @return {AlterScriptDto[]}
 */
const getModifyNotNullColumnsScriptDtos = (collection, fullTableName) => {
	const isContainerActivated = isParentContainerActivated(collection);
	const isCollectionActivated = isObjectInDeltaModelActivated(collection);

	const currentRequiredColumnNames = collection.required || [];
	const previousRequiredColumnNames = collection.role?.required || [];

	const columnNamesToAddNotNullConstraint = _.difference(currentRequiredColumnNames, previousRequiredColumnNames);
	const columnNamesToRemoveNotNullConstraint = _.difference(previousRequiredColumnNames, currentRequiredColumnNames);

	const addNotNullConstraintsDtos = _.toPairs(collection.properties)
		.filter(([name, jsonSchema]) => {
			const oldName = jsonSchema.compMod?.oldField?.name;
			const shouldRemoveForOldName = oldName && columnNamesToRemoveNotNullConstraint.includes(oldName);
			const shouldAddForNewName = columnNamesToAddNotNullConstraint.includes(name);
			return shouldAddForNewName && !shouldRemoveForOldName;
		})
		.map(([columnName, jsonSchema]) => {
			const isActivated = isContainerActivated && isCollectionActivated && jsonSchema.isActivated;
			const columnNameFormatted = getName(collection.isCaseSensitive, columnName);
			const script = assignTemplates(templates.alterTable, {
				name: fullTableName,
				action: `ALTER COLUMN ${columnNameFormatted} SET NOT NULL`,
				dynamic: '',
			});
			return AlterScriptDto.getInstance([script], isActivated, false);
		})
		.filter(Boolean);

	const removeNotNullConstraintsDtos = _.toPairs(collection.properties)
		.filter(([name, jsonSchema]) => {
			const oldName = jsonSchema.compMod?.oldField?.name;
			const shouldRemoveForOldName = oldName && columnNamesToRemoveNotNullConstraint.includes(oldName);
			const shouldAddForNewName = columnNamesToAddNotNullConstraint.includes(name);
			return shouldRemoveForOldName && !shouldAddForNewName;
		})
		.map(([name, jsonSchema]) => {
			const isActivated = isContainerActivated && isCollectionActivated && jsonSchema.isActivated;
			const columnNameFormatted = getName(collection.isCaseSensitive, name);
			const script = assignTemplates(templates.alterTable, {
				name: fullTableName,
				action: `ALTER COLUMN ${columnNameFormatted} DROP NOT NULL`,
				dynamic: '',
			});
			return AlterScriptDto.getInstance([script], isActivated, true);
		})
		.filter(Boolean);

	return [...addNotNullConstraintsDtos, ...removeNotNullConstraintsDtos];
};

module.exports = {
	getModifyNotNullColumnsScriptDtos,
};
