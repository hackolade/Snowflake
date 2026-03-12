const _ = require('lodash');

const { AlterScriptDto } = require('../../types/AlterScriptDto');
const { PrimaryKeyTransitionDto, KeyScriptModificationDto } = require('../../types/AlterKeyDto');

const { getNames } = require('../common');
const {
	getName,
	getFullName,
	getEntityName,
	isParentContainerActivated,
	isObjectInDeltaModelActivated,
} = require('../../general');
const { generateConstraint } = require('../../constraintHelper');
const assignTemplates = require('../../../utils/assignTemplates');
const templates = require('../../../configs/templates');

const amountOfColumnsInRegularKey = 1;

/**
 * Configuration object for key constraint handling
 * @typedef {Object} KeyConstraintConfig
 * @property {string} constraintType - e.g., 'PRIMARY KEY' or 'UNIQUE'
 * @property {string} compModKeyName - e.g., 'primaryKey' or 'uniqueKey'
 * @property {string} columnKeyProperty - e.g., 'primaryKey' or 'unique'
 * @property {string} compositeKeyProperty - e.g., 'compositePrimaryKey' or 'compositeUniqueKey'
 * @property {string} constraintNameProperty - e.g., 'primaryKeyConstraintName' or 'uniqueKeyConstraintName'
 */

/**
 * Get column names from composite key by matching keyId with column GUID
 * @param {Array<{ type: string, keyId: string}>} compositeKey
 * @param {Object.<string, AlterCollectionColumnDto>} properties
 * @param {KeyConstraintConfig} config
 */
const getCompositeKeyColumnNames = (compositeKey, properties, config) => {
	return compositeKey
		.map(keyDto => {
			const column = Object.entries(properties).find(([name, col]) => col.GUID === keyDto.keyId);
			return column ? { name: column[0], isActivated: column[1].isActivated } : null;
		})
		.filter(Boolean);
};

/**
 * Compare constraint names (Snowflake only supports constraint name, no other options)
 * @param {string} [oldName]
 * @param {string} [newName]
 * @return {boolean}
 */
const areConstraintNamesEqual = (oldName, newName) => {
	return oldName === newName;
};

/**
 * Check if composite key was changed in transition from composite to regular
 * @param {AlterCollectionDto} collection
 * @param {KeyConstraintConfig} config
 * @return {PrimaryKeyTransitionDto}
 * */
const wasCompositeKeyChangedInTransitionFromCompositeToRegular = (collection, config) => {
	const keyDto = collection?.role?.compMod?.[config.compModKeyName] || {};
	const oldKeys = keyDto.old || [];
	const idsOfColumns = oldKeys.flatMap(key => key[config.compositeKeyProperty]?.map(dto => dto.keyId) || []);

	if (idsOfColumns.length !== amountOfColumnsInRegularKey) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const idOfKeyColumn = idsOfColumns[0];
	const newColumnJsonSchema = Object.values(collection.properties || {}).find(
		columnJsonSchema => columnJsonSchema.GUID === idOfKeyColumn,
	);

	if (!newColumnJsonSchema) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const isNewColumnARegularKey =
		newColumnJsonSchema?.[config.columnKeyProperty] && !newColumnJsonSchema?.[config.compositeKeyProperty];
	if (!isNewColumnARegularKey) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	// In Snowflake, compare only constraint names
	const newConstraintName = newColumnJsonSchema[config.constraintNameProperty] || '';
	const areNamesEqual = oldKeys.some(compositeKey => {
		if (compositeKey[config.compositeKeyProperty]?.length !== amountOfColumnsInRegularKey) {
			return false;
		}
		const oldConstraintName = compositeKey.constraintName || '';
		return areConstraintNamesEqual(oldConstraintName, newConstraintName);
	});

	return PrimaryKeyTransitionDto.transition(!areNamesEqual);
};

/**
 * Check if composite key was changed in transition from regular to composite
 * @param {AlterCollectionDto} collection
 * @param {KeyConstraintConfig} config
 * @return {PrimaryKeyTransitionDto}
 * */
const wasCompositeKeyChangedInTransitionFromRegularToComposite = (collection, config) => {
	const keyDto = collection?.role?.compMod?.[config.compModKeyName] || {};
	const newKeys = keyDto.new || [];
	const idsOfColumns = newKeys.flatMap(key => key[config.compositeKeyProperty]?.map(dto => dto.keyId) || []);

	if (idsOfColumns.length !== amountOfColumnsInRegularKey) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const idOfKeyColumn = idsOfColumns[0];
	const oldColumnJsonSchema = Object.values(collection.role.properties).find(
		columnJsonSchema => columnJsonSchema.GUID === idOfKeyColumn,
	);

	if (!oldColumnJsonSchema) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const isOldColumnARegularKey =
		oldColumnJsonSchema?.[config.columnKeyProperty] && !oldColumnJsonSchema?.[config.compositeKeyProperty];
	if (!isOldColumnARegularKey) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const oldConstraintName = oldColumnJsonSchema[config.constraintNameProperty] || '';
	const areNamesEqual = newKeys.some(compositeKey => {
		if (compositeKey[config.compositeKeyProperty]?.length !== amountOfColumnsInRegularKey) {
			return false;
		}
		const newConstraintName = compositeKey.constraintName || '';
		return areConstraintNamesEqual(oldConstraintName, newConstraintName);
	});

	return PrimaryKeyTransitionDto.transition(!areNamesEqual);
};

/**
 * Get ADD CONSTRAINT scripts for composite keys
 * @param {AlterCollectionDto} collection
 * @param {KeyConstraintConfig} config
 * @return {Array<KeyScriptModificationDto>}
 */
const getAddCompositeKeyScriptDtos = (collection, config) => {
	const keyDto = collection?.role?.compMod?.[config.compModKeyName] || {};
	const newKeys = keyDto.new || [];
	const oldKeys = keyDto.old || [];

	if (newKeys.length === 0 && oldKeys.length === 0) {
		return [];
	}

	const transitionToCompositeDto = wasCompositeKeyChangedInTransitionFromRegularToComposite(collection, config);
	if (transitionToCompositeDto.didTransitionHappen && !transitionToCompositeDto.wasPkChangedInTransition) {
		return [];
	}

	if (newKeys.length === oldKeys.length) {
		const areKeyArraysEqual = _(oldKeys).differenceWith(newKeys, _.isEqual).isEmpty();
		if (areKeyArraysEqual) {
			return [];
		}
	}

	const collectionSchema = { ...collection, ..._.omit(collection?.role, 'properties') };
	const { schemaName, databaseName, tableName } = getNames(collectionSchema, getName, getEntityName);
	const fullName = getFullName(databaseName, getFullName(schemaName, tableName));
	const isCaseSensitive = collectionSchema.isCaseSensitive;

	const isContainerActivated = isParentContainerActivated(collection);
	const isCollectionActivated = isObjectInDeltaModelActivated(collection);

	return newKeys
		.map(newKey => {
			const columns = getCompositeKeyColumnNames(
				newKey[config.compositeKeyProperty] || [],
				collection.role.properties,
				config,
			);

			if (_.isEmpty(columns)) {
				return null;
			}

			const { statement } = generateConstraint({
				name: newKey.constraintName,
				keys: columns,
				keyType: config.constraintType,
				isParentActivated: true,
				isCaseSensitive,
			});

			const script = assignTemplates(templates.alterTableAddConstraint, {
				tableName: fullName,
				statement,
			});
			return new KeyScriptModificationDto(script, fullName, false, isContainerActivated && isCollectionActivated);
		})
		.filter(scriptDto => Boolean(scriptDto?.script));
};

/**
 * Get DROP CONSTRAINT scripts for composite keys
 * @param {AlterCollectionDto} collection
 * @param {KeyConstraintConfig} config
 * @return {KeyScriptModificationDto[]}
 */
const getDropCompositeKeyScriptDtos = (collection, config) => {
	const keyDto = collection?.role?.compMod?.[config.compModKeyName] || {};
	const newKeys = keyDto.new || [];
	const oldKeys = keyDto.old || [];

	if (newKeys.length === 0 && oldKeys.length === 0) {
		return [];
	}

	const transitionToCompositeDto = wasCompositeKeyChangedInTransitionFromCompositeToRegular(collection, config);
	if (transitionToCompositeDto.didTransitionHappen && !transitionToCompositeDto.wasPkChangedInTransition) {
		return [];
	}

	if (newKeys.length === oldKeys.length) {
		const areKeyArraysEqual = _(oldKeys).differenceWith(newKeys, _.isEqual).isEmpty();
		if (areKeyArraysEqual) {
			return [];
		}
	}

	const collectionSchema = { ...collection, ..._.omit(collection?.role, 'properties') };
	const { schemaName, databaseName, tableName } = getNames(collectionSchema, getName, getEntityName);
	const fullName = getFullName(databaseName, getFullName(schemaName, tableName));
	const isCaseSensitive = collectionSchema.isCaseSensitive;

	const isContainerActivated = isParentContainerActivated(collection);
	const isCollectionActivated = isObjectInDeltaModelActivated(collection);

	return oldKeys
		.map(oldKey => {
			let script;
			const constraintName = getName(isCaseSensitive, oldKey.constraintName);
			if (constraintName) {
				script = assignTemplates(templates.alterTableDropNamedConstraint, {
					tableName: fullName,
					constraintName,
				});
			} else {
				const columns = getCompositeKeyColumnNames(
					oldKey[config.compositeKeyProperty] || [],
					collection.role.properties,
					config,
				);

				if (_.isEmpty(columns)) {
					return null;
				}

				const { statement } = generateConstraint({
					name: oldKey.constraintName,
					keys: columns,
					keyType: config.constraintType,
					isParentActivated: true,
					isCaseSensitive,
				});

				script = assignTemplates(templates.alterTableDropStatement, {
					tableName: fullName,
					statement,
				});
			}
			return new KeyScriptModificationDto(script, fullName, true, isContainerActivated && isCollectionActivated);
		})
		.filter(scriptDto => Boolean(scriptDto?.script));
};

/**
 * Get modify scripts for composite keys (drop + add)
 * @param {AlterCollectionDto} collection
 * @param {KeyConstraintConfig} config
 * @return {Array<KeyScriptModificationDto>}
 */
const getModifyCompositeKeyScriptDtos = (collection, config) => {
	const dropCompositeKeyScriptDtos = getDropCompositeKeyScriptDtos(collection, config);
	const addCompositeKeyScriptDtos = getAddCompositeKeyScriptDtos(collection, config);
	return [...dropCompositeKeyScriptDtos, ...addCompositeKeyScriptDtos].filter(Boolean);
};

/**
 * Check if field was changed to be a regular key
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @param {KeyConstraintConfig} config
 * @return {boolean}
 * */
const wasFieldChangedToBeARegularKey = (columnJsonSchema, collection, config) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldColumnJsonSchema = collection.role.properties[oldName];

	const isRegularKey = columnJsonSchema[config.columnKeyProperty] && !columnJsonSchema[config.compositeKeyProperty];
	const wasTheFieldAnyKey = Boolean(oldColumnJsonSchema?.[config.columnKeyProperty]);

	return isRegularKey && !wasTheFieldAnyKey;
};

/**
 * Check if field is no longer a regular key
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @param {KeyConstraintConfig} config
 * @return {boolean}
 * */
const isFieldNoLongerARegularKey = (columnJsonSchema, collection, config) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldJsonSchema = collection.role.properties[oldName];
	const wasTheFieldARegularKey =
		oldJsonSchema?.[config.columnKeyProperty] && !oldJsonSchema?.[config.compositeKeyProperty];

	const isNotAnyKey = !columnJsonSchema[config.columnKeyProperty] && !columnJsonSchema[config.compositeKeyProperty];
	return wasTheFieldARegularKey && isNotAnyKey;
};

/**
 * Check if regular key was modified (constraint name changed)
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @param {KeyConstraintConfig} config
 * @return {boolean}
 * */
const wasRegularKeyModified = (columnJsonSchema, collection, config) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldJsonSchema = collection.role.properties[oldName] || {};

	const isRegularKey = columnJsonSchema[config.columnKeyProperty] && !columnJsonSchema[config.compositeKeyProperty];
	const wasTheFieldARegularKey =
		oldJsonSchema?.[config.columnKeyProperty] && !oldJsonSchema?.[config.compositeKeyProperty];

	if (!(isRegularKey && wasTheFieldARegularKey)) {
		return false;
	}

	const oldConstraintName = oldJsonSchema[config.constraintNameProperty] || '';
	const newConstraintName = columnJsonSchema[config.constraintNameProperty] || '';

	return !areConstraintNamesEqual(oldConstraintName, newConstraintName);
};

/**
 * Check if regular key changed in transition from composite to regular
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @param {KeyConstraintConfig} config
 * @return {PrimaryKeyTransitionDto}
 * */
const wasRegularKeyChangedInTransitionFromCompositeToRegular = (columnJsonSchema, collection, config) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldColumnJsonSchema = collection.role.properties[oldName];

	const isRegularKey = columnJsonSchema[config.columnKeyProperty] && !columnJsonSchema[config.compositeKeyProperty];
	const wasTheFieldAnyKey = Boolean(oldColumnJsonSchema?.[config.columnKeyProperty]);

	if (!(isRegularKey && wasTheFieldAnyKey)) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const keyDto = collection?.role?.compMod?.[config.compModKeyName] || {};
	const newKeys = keyDto.new || [];
	const oldKeys = keyDto.old || [];

	const wasTheFieldACompositeKey = oldKeys.some(compKey =>
		compKey[config.compositeKeyProperty]?.some(key => key.keyId === oldColumnJsonSchema.GUID),
	);
	const isTheFieldACompositeKey = newKeys.some(compKey =>
		compKey[config.compositeKeyProperty]?.some(key => key.keyId === columnJsonSchema.GUID),
	);

	const wasCompositeKeyRemoved = wasTheFieldACompositeKey && !isTheFieldACompositeKey;

	if (isRegularKey && wasCompositeKeyRemoved) {
		// In Snowflake, only compare constraint names
		const newConstraintName = columnJsonSchema[config.constraintNameProperty] || '';
		const areNamesEqual = oldKeys.some(oldCompositeKey => {
			if (oldCompositeKey[config.compositeKeyProperty]?.length !== amountOfColumnsInRegularKey) {
				return false;
			}
			const oldConstraintName = oldCompositeKey.constraintName || '';
			return areConstraintNamesEqual(oldConstraintName, newConstraintName);
		});
		return PrimaryKeyTransitionDto.transition(!areNamesEqual);
	}

	return PrimaryKeyTransitionDto.noTransition();
};

/**
 * Check if regular key changed in transition from regular to composite
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @param {KeyConstraintConfig} config
 * @return {PrimaryKeyTransitionDto}
 * */
const wasRegularKeyChangedInTransitionFromRegularToComposite = (columnJsonSchema, collection, config) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldColumnJsonSchema = collection.role.properties[oldName];

	const wasRegularKey =
		oldColumnJsonSchema[config.columnKeyProperty] && !oldColumnJsonSchema[config.compositeKeyProperty];
	const isTheFieldAnyKey = Boolean(columnJsonSchema?.[config.columnKeyProperty]);

	if (!(wasRegularKey && isTheFieldAnyKey)) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const keyDto = collection?.role?.compMod?.[config.compModKeyName] || {};
	const newKeys = keyDto.new || [];
	const oldKeys = keyDto.old || [];

	const wasTheFieldACompositeKey = oldKeys.some(compKey =>
		compKey[config.compositeKeyProperty]?.some(key => key.keyId === oldColumnJsonSchema.GUID),
	);
	const isTheFieldACompositeKey = newKeys.some(compKey =>
		compKey[config.compositeKeyProperty]?.some(key => key.keyId === columnJsonSchema.GUID),
	);

	const wasCompositeKeyAdded = isTheFieldACompositeKey && !wasTheFieldACompositeKey;

	if (wasRegularKey && wasCompositeKeyAdded) {
		// In Snowflake, only compare constraint names
		const oldConstraintName = oldColumnJsonSchema[config.constraintNameProperty] || '';
		const areNamesEqual = newKeys.some(newCompositeKey => {
			if (newCompositeKey[config.compositeKeyProperty]?.length !== amountOfColumnsInRegularKey) {
				return false;
			}
			const newConstraintName = newCompositeKey.constraintName || '';
			return areConstraintNamesEqual(oldConstraintName, newConstraintName);
		});
		return PrimaryKeyTransitionDto.transition(!areNamesEqual);
	}

	return PrimaryKeyTransitionDto.noTransition();
};

/**
 * Get ADD CONSTRAINT scripts for regular (column-level) keys
 * @param {AlterCollectionDto} collection
 * @param {KeyConstraintConfig} config
 * @return {Array<KeyScriptModificationDto>}
 */
const getAddRegularKeyScriptDtos = (collection, config) => {
	const collectionSchema = { ...collection, ..._.omit(collection?.role, 'properties') };
	const { schemaName, databaseName, tableName } = getNames(collectionSchema, getName, getEntityName);
	const fullName = getFullName(databaseName, getFullName(schemaName, tableName));
	const isCaseSensitive = collectionSchema.isCaseSensitive;

	const isContainerActivated = isParentContainerActivated(collection);
	const isCollectionActivated = isObjectInDeltaModelActivated(collection);

	return _.toPairs(collection.properties)
		.filter(([name, jsonSchema]) => {
			if (wasFieldChangedToBeARegularKey(jsonSchema, collection, config)) {
				return true;
			}
			const transitionToRegularDto = wasRegularKeyChangedInTransitionFromCompositeToRegular(
				jsonSchema,
				collection,
				config,
			);
			if (transitionToRegularDto.didTransitionHappen) {
				return transitionToRegularDto.wasPkChangedInTransition;
			}
			return wasRegularKeyModified(jsonSchema, collection, config);
		})
		.map(([name, jsonSchema]) => {
			const columns = [{ name, isActivated: jsonSchema.isActivated }];

			const { statement } = generateConstraint({
				name: jsonSchema[config.constraintNameProperty],
				keys: columns,
				keyType: config.constraintType,
				isParentActivated: true,
				isCaseSensitive,
			});

			const script = assignTemplates(templates.alterTableAddConstraint, {
				tableName: fullName,
				statement,
			});
			return new KeyScriptModificationDto(script, fullName, false, isContainerActivated && isCollectionActivated);
		})
		.filter(scriptDto => Boolean(scriptDto?.script));
};

/**
 * Get DROP CONSTRAINT scripts for regular (column-level) keys
 * @param {AlterCollectionDto} collection
 * @param {KeyConstraintConfig} config
 * @return {Array<KeyScriptModificationDto>}
 */
const getDropRegularKeyScriptDtos = (collection, config) => {
	const collectionSchema = { ...collection, ..._.omit(collection?.role, 'properties') };
	const { schemaName, databaseName, tableName } = getNames(collectionSchema, getName, getEntityName);
	const fullName = getFullName(databaseName, getFullName(schemaName, tableName));
	const isCaseSensitive = collectionSchema.isCaseSensitive;

	const isContainerActivated = isParentContainerActivated(collection);
	const isCollectionActivated = isObjectInDeltaModelActivated(collection);

	return _.toPairs(collection.properties)
		.filter(([name, jsonSchema]) => {
			if (isFieldNoLongerARegularKey(jsonSchema, collection, config)) {
				return true;
			}
			const transitionToRegularDto = wasRegularKeyChangedInTransitionFromRegularToComposite(
				jsonSchema,
				collection,
				config,
			);
			if (transitionToRegularDto.didTransitionHappen) {
				return transitionToRegularDto.wasPkChangedInTransition;
			}
			return wasRegularKeyModified(jsonSchema, collection, config);
		})
		.map(([name, jsonSchema]) => {
			const oldName = jsonSchema.compMod.oldField.name;
			const oldJsonSchema = collection.role.properties[oldName];

			const { statement } = generateConstraint({
				name: getName(isCaseSensitive, oldJsonSchema[config.constraintNameProperty]),
				keys: [{ name, isActivated: true }],
				keyType: config.constraintType,
				isParentActivated: true,
				isCaseSensitive,
			});

			const script = assignTemplates(templates.alterTableDropStatement, {
				tableName: fullName,
				statement,
			});
			return new KeyScriptModificationDto(script, fullName, true, isContainerActivated && isCollectionActivated);
		})
		.filter(scriptDto => Boolean(scriptDto?.script));
};

/**
 * Get modify scripts for regular keys (drop + add)
 * @param {AlterCollectionDto} collection
 * @param {KeyConstraintConfig} config
 * @return {Array<KeyScriptModificationDto>}
 */
const getModifyRegularKeyScriptDtos = (collection, config) => {
	const dropKeyScriptDtos = getDropRegularKeyScriptDtos(collection, config);
	const addKeyScriptDtos = getAddRegularKeyScriptDtos(collection, config);
	return [...dropKeyScriptDtos, ...addKeyScriptDtos].filter(Boolean);
};

/**
 * Sort modify key constraints to ensure DROP operations come before ADD operations for the same table
 * @param {KeyScriptModificationDto[]} constraintDtos
 * @return {KeyScriptModificationDto[]}
 */
const sortModifyKeyConstraints = constraintDtos => {
	return constraintDtos.sort((c1, c2) => {
		if (c1.fullTableName === c2.fullTableName) {
			// Number(true) = 1, Number(false) = 0;
			// This ensures that DROP script appears before CREATE script
			// if the same table has 2 scripts that drop and recreate key
			return Number(c2.isDropScript) - Number(c1.isDropScript);
		}
		// This sorts all statements based on full table name, ASC
		return c1.fullTableName < c2.fullTableName ? -1 : 1;
	});
};

/**
 * Get all modify key scripts (both composite and regular)
 *
 * @param {AlterCollectionDto} collection
 * @param {KeyConstraintConfig} config
 * @return {AlterScriptDto[]}
 * */
const getModifyKeyScripts = (collection, config) => {
	const modifyCompositeKeyScriptDtos = getModifyCompositeKeyScriptDtos(collection, config);
	const modifyRegularKeyScriptDtos = getModifyRegularKeyScriptDtos(collection, config);

	const allDtos = [...modifyCompositeKeyScriptDtos, ...modifyRegularKeyScriptDtos];
	const sortedAllDtos = sortModifyKeyConstraints(allDtos);

	return sortedAllDtos
		.map(dto => {
			return AlterScriptDto.getInstance([dto.script], dto.isActivated, dto.isDropScript);
		})
		.filter(Boolean);
};

module.exports = {
	getModifyKeyScripts,
};
