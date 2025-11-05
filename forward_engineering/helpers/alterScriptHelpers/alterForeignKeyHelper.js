const _ = require('lodash');
const { AlterScriptDto } = require('../types/AlterScriptDto');
const { getName } = require('../general');

/**
 * Get the relationship name (constraint name)
 * @param {Object} relationship
 * @return {string}
 */
const getRelationshipName = relationship => {
	return relationship.role?.code || relationship.role?.name || '';
};

/**
 * Create ADD FOREIGN KEY statement using ddlProvider
 * @param {Object} ddlProvider
 * @return {(relationship: Object) => {isActivated: boolean, statement: string}}
 */
const getAddSingleForeignKeyStatementDto = ddlProvider => relationship => {
	const compMod = relationship.role?.compMod;

	const relationshipName = compMod?.code?.new || compMod?.name?.new || getRelationshipName(relationship) || '';

	return ddlProvider.createForeignKey(
		{
			name: relationshipName,
			foreignKey: compMod?.child?.collection?.fkFields || [],
			primaryKey: compMod?.parent?.collection?.fkFields || [],
			customProperties: compMod?.customProperties?.new,
			foreignTable: compMod?.child?.collection?.name || '',
			foreignSchemaName: compMod?.child?.bucket?.name || '',
			foreignTableIsCaseSensitive: compMod?.child?.collection?.isCaseSensitive,
			foreignTableActivated: compMod?.child?.collection?.isActivated !== false,
			primaryTable: compMod?.parent?.collection?.name || '',
			primarySchemaName: compMod?.parent?.bucket?.name || '',
			primaryTableIsCaseSensitive: compMod?.parent?.collection?.isCaseSensitive,
			primaryTableActivated: compMod?.parent?.collection?.isActivated !== false,
			isActivated: compMod?.isActivated?.new !== false,
		},
		null,
		{
			schemaName: compMod?.child?.bucket?.name || '',
			databaseName: compMod?.child?.bucket?.database || '',
			isCaseSensitive: compMod?.child?.bucket?.isCaseSensitive,
		},
	);
};

/**
 * Check if relationship can be added
 * @param {Object} relationship
 * @return {boolean}
 */
const canRelationshipBeAdded = relationship => {
	const compMod = relationship.role?.compMod;
	if (!compMod) {
		return false;
	}

	return [
		compMod.code?.new || compMod.name?.new || getRelationshipName(relationship),
		compMod.parent?.bucket,
		compMod.parent?.collection,
		compMod.parent?.collection?.fkFields?.length,
		compMod.child?.bucket,
		compMod.child?.collection,
		compMod.child?.collection?.fkFields?.length,
	].every(Boolean);
};

/**
 * Get ADD FOREIGN KEY scripts
 * @param {Object} ddlProvider
 * @return {(addedRelationships: Array<Object>) => Array<AlterScriptDto>}
 */
const getAddForeignKeyScriptDtos = ddlProvider => addedRelationships => {
	return addedRelationships
		.filter(relationship => canRelationshipBeAdded(relationship))
		.map(relationship => {
			const scriptDto = getAddSingleForeignKeyStatementDto(ddlProvider)(relationship);
			return AlterScriptDto.getInstance([scriptDto.statement], scriptDto.isActivated, false);
		})
		.filter(Boolean)
		.filter(res => res.scripts.some(scriptDto => Boolean(scriptDto.script)));
};

/**
 * Create DROP FOREIGN KEY statement
 * @param {Object} ddlProvider
 * @return {(relationship: Object) => {isActivated: boolean, statement: string}}
 */
const getDeleteSingleForeignKeyStatementDto = ddlProvider => relationship => {
	const compMod = relationship.role?.compMod;

	const relationshipName = compMod?.code?.old || compMod?.name?.old || getRelationshipName(relationship);
	const childIsCaseSensitive = compMod?.child?.collection?.isCaseSensitive;

	// Build the full child table name
	const childBucketName = getName(childIsCaseSensitive, compMod?.child?.bucket?.name);
	const childDatabaseName = getName(childIsCaseSensitive, compMod?.child?.bucket?.database);
	const childTableName = getName(childIsCaseSensitive, compMod?.child?.collection?.name);

	let fullChildTableName = childTableName;
	if (childBucketName) {
		fullChildTableName = `${childBucketName}.${fullChildTableName}`;
	}
	if (childDatabaseName) {
		fullChildTableName = `${childDatabaseName}.${fullChildTableName}`;
	}

	const constraintName = getName(childIsCaseSensitive, relationshipName);
	const statement = ddlProvider.dropForeignKey(fullChildTableName, constraintName);

	const isChildTableActivated = compMod?.child?.collection?.isActivated !== false;
	const isRelationshipActivated = compMod?.isActivated?.old !== false;

	return {
		statement,
		isActivated: isRelationshipActivated && isChildTableActivated,
	};
};

/**
 * Check if relationship can be deleted
 * @param {Object} relationship
 * @return {boolean}
 */
const canRelationshipBeDeleted = relationship => {
	const compMod = relationship.role?.compMod;
	if (!compMod) {
		return false;
	}

	return [
		compMod.code?.old || compMod.name?.old || getRelationshipName(relationship),
		compMod.child?.bucket,
		compMod.child?.collection,
	].every(Boolean);
};

/**
 * Get DROP FOREIGN KEY scripts
 * @param {Object} ddlProvider
 * @return {(deletedRelationships: Array<Object>) => Array<AlterScriptDto>}
 */
const getDeleteForeignKeyScriptDtos = ddlProvider => deletedRelationships => {
	return deletedRelationships
		.filter(relationship => canRelationshipBeDeleted(relationship))
		.map(relationship => {
			const scriptDto = getDeleteSingleForeignKeyStatementDto(ddlProvider)(relationship);
			return AlterScriptDto.getInstance([scriptDto.statement], scriptDto.isActivated, true);
		})
		.filter(Boolean)
		.filter(res => res.scripts.some(scriptDto => Boolean(scriptDto.script)));
};

/**
 * Get MODIFY FOREIGN KEY scripts (drop + recreate)
 * @param {Object} ddlProvider
 * @return {(modifiedRelationships: Array<Object>) => Array<AlterScriptDto>}
 */
const getModifyForeignKeyScriptDtos = ddlProvider => modifiedRelationships => {
	return modifiedRelationships
		.filter(relationship => canRelationshipBeAdded(relationship) && canRelationshipBeDeleted(relationship))
		.map(relationship => {
			const deleteScriptDto = getDeleteSingleForeignKeyStatementDto(ddlProvider)(relationship);
			const addScriptDto = getAddSingleForeignKeyStatementDto(ddlProvider)(relationship);
			const isActivated = addScriptDto.isActivated && deleteScriptDto.isActivated;

			return AlterScriptDto.getDropAndRecreateInstance(
				deleteScriptDto.statement,
				addScriptDto.statement,
				isActivated,
			);
		})
		.filter(Boolean)
		.filter(res => res.scripts.some(scriptDto => Boolean(scriptDto.script)));
};

module.exports = {
	getAddForeignKeyScriptDtos,
	getDeleteForeignKeyScriptDtos,
	getModifyForeignKeyScriptDtos,
	getRelationshipName,
};
