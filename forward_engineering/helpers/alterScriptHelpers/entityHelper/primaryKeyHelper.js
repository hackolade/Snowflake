const _ = require('lodash');

const { AlterScriptDto } = require('../../types/AlterScriptDto');
const { AlterCollectionDto, AlterCollectionColumnDto } = require('../../types/AlterCollectionDto');
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

const amountOfColumnsInRegularPk = 1;
const PRIMARY_KEY_CONSTRAINT = 'PRIMARY KEY';

/**
 * Get column names from composite primary key by matching keyId with column GUID
 * @param {Array<{ type: string, keyId: string}>} compositePrimaryKey
 * @param {Object.<string, AlterCollectionColumnDto>} properties
 */
const getCompositePkColumnNames = (compositePrimaryKey, properties) => {
	return compositePrimaryKey
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
 * Check if composite PK was changed in transition from composite to regular
 * @param {AlterCollectionDto} collection
 * @return {PrimaryKeyTransitionDto}
 * */
const wasCompositePkChangedInTransitionFromCompositeToRegular = collection => {
	const pkDto = collection?.role?.compMod?.primaryKey || {};
	const oldPrimaryKeys = pkDto.old || [];
	const idsOfColumns = oldPrimaryKeys.flatMap(pk => pk.compositePrimaryKey?.map(dto => dto.keyId) || []);

	if (idsOfColumns.length !== amountOfColumnsInRegularPk) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const idOfPkColumn = idsOfColumns[0];
	const newColumnJsonSchema = Object.values(collection.properties).find(
		columnJsonSchema => columnJsonSchema.GUID === idOfPkColumn,
	);

	if (!newColumnJsonSchema) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const isNewColumnARegularPrimaryKey = newColumnJsonSchema?.primaryKey && !newColumnJsonSchema?.compositePrimaryKey;
	if (!isNewColumnARegularPrimaryKey) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	// In Snowflake, compare only constraint names
	const newConstraintName = newColumnJsonSchema.primaryKeyConstraintName || '';
	const areNamesEqual = oldPrimaryKeys.some(compositePk => {
		if (compositePk.compositePrimaryKey?.length !== amountOfColumnsInRegularPk) {
			return false;
		}
		const oldConstraintName = compositePk.constraintName || '';
		return areConstraintNamesEqual(oldConstraintName, newConstraintName);
	});

	return PrimaryKeyTransitionDto.transition(!areNamesEqual);
};

/**
 * Check if composite PK was changed in transition from regular to composite
 * @param {AlterCollectionDto} collection
 * @return {PrimaryKeyTransitionDto}
 * */
const wasCompositePkChangedInTransitionFromRegularToComposite = collection => {
	const pkDto = collection?.role?.compMod?.primaryKey || {};
	const newPrimaryKeys = pkDto.new || [];
	const idsOfColumns = newPrimaryKeys.flatMap(pk => pk.compositePrimaryKey?.map(dto => dto.keyId) || []);

	if (idsOfColumns.length !== amountOfColumnsInRegularPk) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const idOfPkColumn = idsOfColumns[0];
	const oldColumnJsonSchema = Object.values(collection.role.properties).find(
		columnJsonSchema => columnJsonSchema.GUID === idOfPkColumn,
	);

	if (!oldColumnJsonSchema) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const isOldColumnARegularPrimaryKey = oldColumnJsonSchema?.primaryKey && !oldColumnJsonSchema?.compositePrimaryKey;
	if (!isOldColumnARegularPrimaryKey) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const oldConstraintName = oldColumnJsonSchema.primaryKeyConstraintName || '';
	const areNamesEqual = newPrimaryKeys.some(compositePk => {
		if (compositePk.compositePrimaryKey?.length !== amountOfColumnsInRegularPk) {
			return false;
		}
		const newConstraintName = compositePk.constraintName || '';
		return areConstraintNamesEqual(oldConstraintName, newConstraintName);
	});

	return PrimaryKeyTransitionDto.transition(!areNamesEqual);
};

/**
 * Get ADD CONSTRAINT scripts for composite primary keys
 * @param {AlterCollectionDto} collection
 * @return {Array<KeyScriptModificationDto>}
 */
const getAddCompositePkScriptDtos = collection => {
	const pkDto = collection?.role?.compMod?.primaryKey || {};
	const newPrimaryKeys = pkDto.new || [];
	const oldPrimaryKeys = pkDto.old || [];

	if (newPrimaryKeys.length === 0 && oldPrimaryKeys.length === 0) {
		return [];
	}

	const transitionToCompositeDto = wasCompositePkChangedInTransitionFromRegularToComposite(collection);
	if (transitionToCompositeDto.didTransitionHappen && !transitionToCompositeDto.wasPkChangedInTransition) {
		return [];
	}

	if (newPrimaryKeys.length === oldPrimaryKeys.length) {
		const areKeyArraysEqual = _(oldPrimaryKeys).differenceWith(newPrimaryKeys, _.isEqual).isEmpty();
		if (areKeyArraysEqual) {
			return [];
		}
	}

	const collectionSchema = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
	const { schemaName, databaseName, tableName } = getNames(collectionSchema, getName, getEntityName);
	const fullName = getFullName(databaseName, getFullName(schemaName, tableName));
	const isCaseSensitive = collectionSchema.isCaseSensitive;

	const isContainerActivated = isParentContainerActivated(collection);
	const isCollectionActivated = isObjectInDeltaModelActivated(collection);

	return newPrimaryKeys
		.map(newPk => {
			const columns = getCompositePkColumnNames(newPk.compositePrimaryKey || [], collection.role.properties);

			if (_.isEmpty(columns)) {
				return null;
			}

			const { statement } = generateConstraint({
				name: newPk.constraintName,
				keys: columns,
				keyType: PRIMARY_KEY_CONSTRAINT,
				isParentActivated: true,
				isCaseSensitive,
			});

			const script = `ALTER TABLE IF EXISTS ${fullName} ADD ${statement};`;
			return new KeyScriptModificationDto(script, fullName, false, isContainerActivated && isCollectionActivated);
		})
		.filter(scriptDto => Boolean(scriptDto?.script));
};

/**
 * Get DROP CONSTRAINT scripts for composite primary keys
 * @param {AlterCollectionDto} collection
 * @return {KeyScriptModificationDto[]}
 */
const getDropCompositePkScriptDtos = collection => {
	const pkDto = collection?.role?.compMod?.primaryKey || {};
	const newPrimaryKeys = pkDto.new || [];
	const oldPrimaryKeys = pkDto.old || [];

	if (newPrimaryKeys.length === 0 && oldPrimaryKeys.length === 0) {
		return [];
	}

	const transitionToCompositeDto = wasCompositePkChangedInTransitionFromCompositeToRegular(collection);
	if (transitionToCompositeDto.didTransitionHappen && !transitionToCompositeDto.wasPkChangedInTransition) {
		return [];
	}

	if (newPrimaryKeys.length === oldPrimaryKeys.length) {
		const areKeyArraysEqual = _(oldPrimaryKeys).differenceWith(newPrimaryKeys, _.isEqual).isEmpty();
		if (areKeyArraysEqual) {
			return [];
		}
	}

	const collectionSchema = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
	const { schemaName, databaseName, tableName } = getNames(collectionSchema, getName, getEntityName);
	const fullName = getFullName(databaseName, getFullName(schemaName, tableName));
	const isCaseSensitive = collectionSchema.isCaseSensitive;

	const isContainerActivated = isParentContainerActivated(collection);
	const isCollectionActivated = isObjectInDeltaModelActivated(collection);

	return oldPrimaryKeys
		.map(oldPk => {
			let script;
			const constraintName = getName(isCaseSensitive, oldPk.constraintName);
			if (constraintName) {
				script = `ALTER TABLE IF EXISTS ${fullName} DROP CONSTRAINT ${constraintName};`;
			} else {
				const columns = getCompositePkColumnNames(oldPk.compositePrimaryKey || [], collection.role.properties);

				if (_.isEmpty(columns)) {
					return null;
				}

				const { statement } = generateConstraint({
					name: oldPk.constraintName,
					keys: columns,
					keyType: PRIMARY_KEY_CONSTRAINT,
					isParentActivated: true,
					isCaseSensitive,
				});

				script = `ALTER TABLE IF EXISTS ${fullName} DROP ${statement};`;
			}
			return new KeyScriptModificationDto(script, fullName, true, isContainerActivated && isCollectionActivated);
		})
		.filter(scriptDto => Boolean(scriptDto?.script));
};

/**
 * Get modify scripts for composite primary keys (drop + add)
 * @param {AlterCollectionDto} collection
 * @return {Array<KeyScriptModificationDto>}
 */
const getModifyCompositePkScriptDtos = collection => {
	const dropCompositePkScriptDtos = getDropCompositePkScriptDtos(collection);
	const addCompositePkScriptDtos = getAddCompositePkScriptDtos(collection);
	return [...dropCompositePkScriptDtos, ...addCompositePkScriptDtos].filter(Boolean);
};

/**
 * Check if field was changed to be a regular PK
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @return {boolean}
 * */
const wasFieldChangedToBeARegularPk = (columnJsonSchema, collection) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldColumnJsonSchema = collection.role.properties[oldName];

	const isRegularPrimaryKey = columnJsonSchema.primaryKey && !columnJsonSchema.compositePrimaryKey;
	const wasTheFieldAnyPrimaryKey = Boolean(oldColumnJsonSchema?.primaryKey);

	return isRegularPrimaryKey && !wasTheFieldAnyPrimaryKey;
};

/**
 * Check if field is no longer a regular PK
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @return {boolean}
 * */
const isFieldNoLongerARegularPk = (columnJsonSchema, collection) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldJsonSchema = collection.role.properties[oldName];
	const wasTheFieldARegularPrimaryKey = oldJsonSchema?.primaryKey && !oldJsonSchema?.compositePrimaryKey;

	const isNotAnyPrimaryKey = !columnJsonSchema.primaryKey && !columnJsonSchema.compositePrimaryKey;
	return wasTheFieldARegularPrimaryKey && isNotAnyPrimaryKey;
};

/**
 * Check if regular PK was modified (constraint name changed)
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @return {boolean}
 * */
const wasRegularPkModified = (columnJsonSchema, collection) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldJsonSchema = collection.role.properties[oldName] || {};

	const isRegularPrimaryKey = columnJsonSchema.primaryKey && !columnJsonSchema.compositePrimaryKey;
	const wasTheFieldARegularPrimaryKey = oldJsonSchema?.primaryKey && !oldJsonSchema?.compositePrimaryKey;

	if (!(isRegularPrimaryKey && wasTheFieldARegularPrimaryKey)) {
		return false;
	}

	const oldConstraintName = oldJsonSchema.primaryKeyConstraintName || '';
	const newConstraintName = columnJsonSchema.primaryKeyConstraintName || '';

	return !areConstraintNamesEqual(oldConstraintName, newConstraintName);
};

/**
 * Check if regular PK changed in transition from composite to regular
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @return {PrimaryKeyTransitionDto}
 * */
const wasRegularPkChangedInTransitionFromCompositeToRegular = (columnJsonSchema, collection) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldColumnJsonSchema = collection.role.properties[oldName];

	const isRegularPrimaryKey = columnJsonSchema.primaryKey && !columnJsonSchema.compositePrimaryKey;
	const wasTheFieldAnyPrimaryKey = Boolean(oldColumnJsonSchema?.primaryKey);

	if (!(isRegularPrimaryKey && wasTheFieldAnyPrimaryKey)) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const pkDto = collection?.role?.compMod?.primaryKey || {};
	const newPrimaryKeys = pkDto.new || [];
	const oldPrimaryKeys = pkDto.old || [];

	const wasTheFieldACompositePrimaryKey = oldPrimaryKeys.some(compPk =>
		compPk.compositePrimaryKey?.some(pk => pk.keyId === oldColumnJsonSchema.GUID),
	);
	const isTheFieldACompositePrimaryKey = newPrimaryKeys.some(compPk =>
		compPk.compositePrimaryKey?.some(pk => pk.keyId === columnJsonSchema.GUID),
	);

	const wasCompositePkRemoved = wasTheFieldACompositePrimaryKey && !isTheFieldACompositePrimaryKey;

	if (isRegularPrimaryKey && wasCompositePkRemoved) {
		// In Snowflake, only compare constraint names
		const newConstraintName = columnJsonSchema.primaryKeyConstraintName || '';
		const areNamesEqual = oldPrimaryKeys.some(oldCompositePk => {
			if (oldCompositePk.compositePrimaryKey?.length !== amountOfColumnsInRegularPk) {
				return false;
			}
			const oldConstraintName = oldCompositePk.constraintName || '';
			return areConstraintNamesEqual(oldConstraintName, newConstraintName);
		});
		return PrimaryKeyTransitionDto.transition(!areNamesEqual);
	}

	return PrimaryKeyTransitionDto.noTransition();
};

/**
 * Check if regular PK changed in transition from regular to composite
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @return {PrimaryKeyTransitionDto}
 * */
const wasRegularPkChangedInTransitionFromRegularToComposite = (columnJsonSchema, collection) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldColumnJsonSchema = collection.role.properties[oldName];

	const wasRegularPrimaryKey = oldColumnJsonSchema.primaryKey && !oldColumnJsonSchema.compositePrimaryKey;
	const isTheFieldAnyPrimaryKey = Boolean(columnJsonSchema?.primaryKey);

	if (!(wasRegularPrimaryKey && isTheFieldAnyPrimaryKey)) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const pkDto = collection?.role?.compMod?.primaryKey || {};
	const newPrimaryKeys = pkDto.new || [];
	const oldPrimaryKeys = pkDto.old || [];

	const wasTheFieldACompositePrimaryKey = oldPrimaryKeys.some(compPk =>
		compPk.compositePrimaryKey?.some(pk => pk.keyId === oldColumnJsonSchema.GUID),
	);
	const isTheFieldACompositePrimaryKey = newPrimaryKeys.some(compPk =>
		compPk.compositePrimaryKey?.some(pk => pk.keyId === columnJsonSchema.GUID),
	);

	const wasCompositePkAdded = isTheFieldACompositePrimaryKey && !wasTheFieldACompositePrimaryKey;

	if (wasRegularPrimaryKey && wasCompositePkAdded) {
		// In Snowflake, only compare constraint names
		const oldConstraintName = oldColumnJsonSchema.primaryKeyConstraintName || '';
		const areNamesEqual = newPrimaryKeys.some(newCompositePk => {
			if (newCompositePk.compositePrimaryKey?.length !== amountOfColumnsInRegularPk) {
				return false;
			}
			const newConstraintName = newCompositePk.constraintName || '';
			return areConstraintNamesEqual(oldConstraintName, newConstraintName);
		});
		return PrimaryKeyTransitionDto.transition(!areNamesEqual);
	}

	return PrimaryKeyTransitionDto.noTransition();
};

/**
 * Get ADD CONSTRAINT scripts for regular (column-level) primary keys
 * @param {AlterCollectionDto} collection
 * @return {Array<KeyScriptModificationDto>}
 */
const getAddRegularPkScriptDtos = collection => {
	const collectionSchema = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
	const { schemaName, databaseName, tableName } = getNames(collectionSchema, getName, getEntityName);
	const fullName = getFullName(databaseName, getFullName(schemaName, tableName));
	const isCaseSensitive = collectionSchema.isCaseSensitive;

	const isContainerActivated = isParentContainerActivated(collection);
	const isCollectionActivated = isObjectInDeltaModelActivated(collection);

	return _.toPairs(collection.properties)
		.filter(([name, jsonSchema]) => {
			if (wasFieldChangedToBeARegularPk(jsonSchema, collection)) {
				return true;
			}
			const transitionToRegularDto = wasRegularPkChangedInTransitionFromCompositeToRegular(
				jsonSchema,
				collection,
			);
			if (transitionToRegularDto.didTransitionHappen) {
				return transitionToRegularDto.wasPkChangedInTransition;
			}
			return wasRegularPkModified(jsonSchema, collection);
		})
		.map(([name, jsonSchema]) => {
			const columns = [{ name, isActivated: jsonSchema.isActivated }];

			const { statement } = generateConstraint({
				name: jsonSchema.primaryKeyConstraintName,
				keys: columns,
				keyType: PRIMARY_KEY_CONSTRAINT,
				isParentActivated: true,
				isCaseSensitive,
			});

			const script = `ALTER TABLE IF EXISTS ${fullName} ADD ${statement};`;
			return new KeyScriptModificationDto(script, fullName, false, isContainerActivated && isCollectionActivated);
		})
		.filter(scriptDto => Boolean(scriptDto?.script));
};

/**
 * Get DROP CONSTRAINT scripts for regular (column-level) primary keys
 * @param {AlterCollectionDto} collection
 * @return {Array<KeyScriptModificationDto>}
 */
const getDropRegularPkScriptDtos = collection => {
	const collectionSchema = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
	const { schemaName, databaseName, tableName } = getNames(collectionSchema, getName, getEntityName);
	const fullName = getFullName(databaseName, getFullName(schemaName, tableName));
	const isCaseSensitive = collectionSchema.isCaseSensitive;

	const isContainerActivated = isParentContainerActivated(collection);
	const isCollectionActivated = isObjectInDeltaModelActivated(collection);

	return _.toPairs(collection.properties)
		.filter(([name, jsonSchema]) => {
			if (isFieldNoLongerARegularPk(jsonSchema, collection)) {
				return true;
			}
			const transitionToRegularDto = wasRegularPkChangedInTransitionFromRegularToComposite(
				jsonSchema,
				collection,
			);
			if (transitionToRegularDto.didTransitionHappen) {
				return transitionToRegularDto.wasPkChangedInTransition;
			}
			return wasRegularPkModified(jsonSchema, collection);
		})
		.map(([name, jsonSchema]) => {
			const oldName = jsonSchema.compMod.oldField.name;
			const oldJsonSchema = collection.role.properties[oldName];

			const { statement } = generateConstraint({
				name: getName(isCaseSensitive, oldJsonSchema.primaryKeyConstraintName),
				keys: [{ name, isActivated: true }],
				keyType: PRIMARY_KEY_CONSTRAINT,
				isParentActivated: true,
				isCaseSensitive,
			});

			const script = `ALTER TABLE IF EXISTS ${fullName} DROP ${statement};`;
			return new KeyScriptModificationDto(script, fullName, true, isContainerActivated && isCollectionActivated);
		})
		.filter(scriptDto => Boolean(scriptDto?.script));
};

/**
 * Get modify scripts for regular primary keys (drop + add)
 * @param {AlterCollectionDto} collection
 * @return {Array<KeyScriptModificationDto>}
 */
const getModifyRegularPkScriptDtos = collection => {
	const dropPkScriptDtos = getDropRegularPkScriptDtos(collection);
	const addPkScriptDtos = getAddRegularPkScriptDtos(collection);
	return [...dropPkScriptDtos, ...addPkScriptDtos].filter(Boolean);
};

/**
 * Sort modify PK constraints to ensure DROP operations come before ADD operations for the same table
 * @param {KeyScriptModificationDto[]} constraintDtos
 * @return {KeyScriptModificationDto[]}
 */
const sortModifyPkConstraints = constraintDtos => {
	return constraintDtos.sort((c1, c2) => {
		if (c1.fullTableName === c2.fullTableName) {
			// Number(true) = 1, Number(false) = 0;
			// This ensures that DROP script appears before CREATE script
			// if the same table has 2 scripts that drop and recreate PK
			return Number(c2.isDropScript) - Number(c1.isDropScript);
		}
		// This sorts all statements based on full table name, ASC
		return c1.fullTableName < c2.fullTableName ? -1 : 1;
	});
};

/**
 * Get all modify PK scripts (both composite and regular)
 *
 * @param {AlterCollectionDto} collection
 * @return {AlterScriptDto[]}
 * */
const getModifyPkScripts = collection => {
	const modifyCompositePkScriptDtos = getModifyCompositePkScriptDtos(collection);
	const modifyRegularPkScriptDtos = getModifyRegularPkScriptDtos(collection);

	const allDtos = [...modifyCompositePkScriptDtos, ...modifyRegularPkScriptDtos];
	const sortedAllDtos = sortModifyPkConstraints(allDtos);

	return sortedAllDtos
		.map(dto => {
			return AlterScriptDto.getInstance([dto.script], dto.isActivated, dto.isDropScript);
		})
		.filter(Boolean);
};

module.exports = {
	getModifyPkScripts,
};
