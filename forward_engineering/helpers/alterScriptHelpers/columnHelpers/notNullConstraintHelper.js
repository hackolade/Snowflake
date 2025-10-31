const _ = require('lodash');
const { AlterScriptDto } = require('../../types/AlterScriptDto');
const { getName, isObjectInDeltaModelActivated, isParentContainerActivated } = require('../../general');
const assignTemplates = require('../../../utils/assignTemplates');
const templates = require('../../../configs/templates');

const ALTER_ACTION = {
	set: 'SET',
	drop: 'DROP',
};

/**
 * Compute columns that should have constraints added or removed
 * @param {string[]} currentRequiredColumnNames
 * @param {string[]} previousRequiredColumnNames
 * @return {{ toAdd: Set<string>, toRemove: Set<string> }}
 */
const computeConstraintChanges = (currentRequiredColumnNames, previousRequiredColumnNames) => {
	const currentSet = new Set(currentRequiredColumnNames);
	const previousSet = new Set(previousRequiredColumnNames);

	const toAdd = new Set();
	const toRemove = new Set();

	for (const columnName of currentSet) {
		if (!previousSet.has(columnName)) {
			toAdd.add(columnName);
		}
	}

	for (const columnName of previousSet) {
		if (!currentSet.has(columnName)) {
			toRemove.add(columnName);
		}
	}

	return { toAdd, toRemove };
};

/**
 * Generate constraint modification DTOs
 * @param {Object} params
 * @param {Object} params.collection - collection object
 * @param {string} params.fullTableName - full table name
 * @param {Set<string>} params.targetColumns - columns to modify
 * @param {Set<string>} params.oppositeColumns - columns with opposite operation (to avoid conflicts on rename)
 * @param {string} params.alterAction - SQL action template (e.g., 'SET' or 'DROP')
 * @param {boolean} params.isDeactivated - whether the operation is a deactivation
 * @param {boolean} params.isContainerActivated - whether container is activated
 * @param {boolean} params.isCollectionActivated - whether collection is activated
 * @return {AlterScriptDto[]}
 */
const generateConstraintDtos = ({
	collection,
	fullTableName,
	targetColumns,
	oppositeColumns,
	alterAction,
	isDeactivated,
	isContainerActivated,
	isCollectionActivated,
}) => {
	return _.toPairs(collection.properties)
		.filter(([name, jsonSchema]) => {
			const oldName = jsonSchema.compMod?.oldField?.name;
			const shouldApplyToOldName = oldName && targetColumns.has(oldName);
			const shouldApplyToNewName = targetColumns.has(name);
			const hasOppositeOperation = oppositeColumns.has(name) || (oldName && oppositeColumns.has(oldName));

			// Apply if the column is in target list and doesn't have the opposite operation
			return (shouldApplyToNewName || shouldApplyToOldName) && !hasOppositeOperation;
		})
		.map(([columnName, jsonSchema]) => {
			const isActivated = isContainerActivated && isCollectionActivated && jsonSchema.isActivated;
			const columnNameFormatted = getName(collection.isCaseSensitive, columnName);
			const script = assignTemplates(templates.alterTable, {
				name: fullTableName,
				action: `ALTER COLUMN ${columnNameFormatted} ${alterAction} NOT NULL`,
				dynamic: '',
			});
			return AlterScriptDto.getInstance([script], isActivated, isDeactivated);
		})
		.filter(Boolean);
};

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

	const { toAdd, toRemove } = computeConstraintChanges(currentRequiredColumnNames, previousRequiredColumnNames);

	const addNotNullConstraintsDtos = generateConstraintDtos({
		collection,
		fullTableName,
		targetColumns: toAdd,
		oppositeColumns: toRemove,
		alterAction: ALTER_ACTION.set,
		isDeactivated: false,
		isContainerActivated,
		isCollectionActivated,
	});

	const removeNotNullConstraintsDtos = generateConstraintDtos({
		collection,
		fullTableName,
		targetColumns: toRemove,
		oppositeColumns: toAdd,
		alterAction: ALTER_ACTION.drop,
		isDeactivated: true,
		isContainerActivated,
		isCollectionActivated,
	});

	return [...addNotNullConstraintsDtos, ...removeNotNullConstraintsDtos];
};

module.exports = {
	getModifyNotNullColumnsScriptDtos,
};
