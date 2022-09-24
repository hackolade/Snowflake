const { 
	checkFieldPropertiesChanged, 
	getNames, 
	getBaseAndContaienrNames,
} = require('./common');

const getAddCollectionScript = (_, ddlProvider) => collection => {
	const { getEntityName, getName } = require('../general')(_);
	const { createColumnDefinitionBySchema } = require('./createColumnDefinition')(_);

	const { schemaName, databaseName } = getBaseAndContaienrNames(collection, getName);
	const jsonSchema = {
		...collection,
		...(_.omit(collection?.role, 'properties') || {}),
	};
	const columnDefinitions = _.toPairs(jsonSchema.properties).map(([name, column]) =>
		createColumnDefinitionBySchema({
			name,
			jsonSchema: column,
			parentJsonSchema: jsonSchema,
			ddlProvider,
		})
	);

	const tableData = {
		name: getEntityName(jsonSchema),
		columns: columnDefinitions.map(ddlProvider.convertColumnDefinition),
		foreignKeyConstraints: [],
		schemaData: { schemaName, databaseName },
		columnDefinitions,
	};
	const hydratedTable = ddlProvider.hydrateTable({
		tableData,
		entityData: [jsonSchema],
		jsonSchema,
	});

	return ddlProvider.createTable(hydratedTable, jsonSchema.isActivated);
};

const getDeleteCollectionScript = _ => collection => {
	const { getEntityName, getFullName, getName } = require('../general')(_);

	const jsonData = {
		...collection,
		...(_.omit(collection?.role, 'properties') || {}),
	};
	const { schemaName, databaseName, tableName } = getNames(jsonData, getName, getEntityName);
	const fullName = getFullName(databaseName, getFullName(schemaName, tableName));

	return `DROP TABLE IF EXISTS ${fullName};`;
};

const getModifyCollectionScript = ddlProvider => collection => {
	const data = ddlProvider.hydrateAlertTable(collection);

	return ddlProvider.alterTable(data);
};

const getAddColumnScript = (_, ddlProvider) => collection => {
	const { getEntityName, getFullName, getName } = require('../general')(_);
	const { createColumnDefinitionBySchema } = require('./createColumnDefinition')(_);
	const { commentIfDeactivated } = require('../commentDeactivatedHelper')(_);

	const collectionSchema = {
		...collection,
		...(_.omit(collection?.role, 'properties') || {}),
	};
	const { schemaName, databaseName, tableName } = getNames(collectionSchema, getName, getEntityName);
	const fullName = getFullName(databaseName, getFullName(schemaName, tableName));

	return _.toPairs(collection.properties)
		.filter(([_, jsonSchema]) => !jsonSchema.compMod)
		.map(([name, jsonSchema]) =>
			createColumnDefinitionBySchema({
				name,
				jsonSchema,
				parentJsonSchema: collectionSchema,
				ddlProvider,
			})
		)
		.map(ddlProvider.convertColumnDefinition)
		.map(
			column =>
				`ALTER TABLE IF EXISTS ${fullName} ADD COLUMN ${commentIfDeactivated(
					column.statement,
					column
				)};`
		);
};

const getDeleteColumnScript = _ => collection => {
	const { getEntityName, getFullName, getName } = require('../general')(_);

	const collectionSchema = {
		...collection,
		...(_.omit(collection?.role, 'properties') || {}),
	};
	const { schemaName, databaseName, tableName } = getNames(collectionSchema, getName, getEntityName);
	const fullName = getFullName(databaseName, getFullName(schemaName, tableName));

	return _.toPairs(collection.properties)
		.filter(([_, jsonSchema]) => !jsonSchema.compMod)
		.map(([name]) => `ALTER TABLE IF EXISTS ${fullName} DROP COLUMN ${name};`);
};

const getModifyColumnScript = _ => collection => {
	const { getEntityName, getFullName, getName } = require('../general')(_);

	const collectionSchema = {
		...collection,
		...(_.omit(collection?.role, 'properties') || {}),
	};
	const { schemaName, databaseName, tableName } = getNames(collectionSchema, getName, getEntityName);
	const fullName = getFullName(databaseName, getFullName(schemaName, tableName));

	const renameColumnScripts = _.values(collection.properties)
		.filter(jsonSchema => checkFieldPropertiesChanged(jsonSchema.compMod, ['name']))
		.map(
			jsonSchema =>
				`ALTER TABLE IF EXISTS ${fullName} RENAME COLUMN ${jsonSchema.compMod.oldField.name} TO ${jsonSchema.compMod.newField.name};`
		);

	const changeTypeScripts = _.toPairs(collection.properties)
		.filter(([name, jsonSchema]) =>
			checkFieldPropertiesChanged(jsonSchema.compMod, ['type', 'mode'])
		)
		.map(
			([name, jsonSchema]) =>
				`ALTER TABLE IF EXISTS ${fullName} ALTER COLUMN ${name} SET DATA TYPE ${
					jsonSchema.compMod.newField.mode || jsonSchema.compMod.newField.type
				};`
		);

	return [...renameColumnScripts, ...changeTypeScripts];
};

module.exports = {
	getAddCollectionScript,
	getDeleteCollectionScript,
	getAddColumnScript,
	getDeleteColumnScript,
	getModifyColumnScript,
	getModifyCollectionScript,
};
