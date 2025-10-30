const _ = require('lodash');
const { checkFieldPropertiesChanged, getNames, getBaseAndContainerNames } = require('./common');
const { createColumnDefinitionBySchema } = require('./createColumnDefinition');
const { commentIfDeactivated } = require('../commentHelpers/commentDeactivatedHelper');
const { getEntityName, getFullName, getName, toString } = require('../general');
const { getSetTagValue, getUnsetTagValue } = require('../../helpers/tagHelper');
const assignTemplates = require('../../utils/assignTemplates');
const templates = require('../../configs/templates');
const { escapeString } = require('../../utils/escapeString');
const { getModifyPkScripts } = require('./entityHelper/primaryKeyHelper');
const { getModifyUkScripts } = require('./entityHelper/uniqueKeyHelper');

const getAddCollectionScript =
	({ ddlProvider, scriptFormat }) =>
	collection => {
		const { schemaName, databaseName } = getBaseAndContainerNames(collection, getName);
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
				scriptFormat,
			}),
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

const getDeleteCollectionScript = collection => {
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

const getAddColumnScript =
	({ ddlProvider, scriptFormat }) =>
	collection => {
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
					scriptFormat,
				}),
			)
			.map(ddlProvider.convertColumnDefinition)
			.map(
				column =>
					`ALTER TABLE IF EXISTS ${fullName} ADD COLUMN ${commentIfDeactivated(column.statement, column)};`,
			);
	};

const getDeleteColumnScript = collection => {
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

const getModifyColumnScript =
	({ scriptFormat }) =>
	collection => {
		const collectionSchema = {
			...collection,
			..._.omit(collection?.role, 'properties'),
		};
		const { schemaName, databaseName, tableName } = getNames(collectionSchema, getName, getEntityName);
		const fullName = getFullName(databaseName, getFullName(schemaName, tableName));

		const renameColumnScripts = _.values(collection.properties)
			.filter(jsonSchema => checkFieldPropertiesChanged(jsonSchema.compMod, ['name']))
			.map(
				jsonSchema =>
					`ALTER TABLE IF EXISTS ${fullName} RENAME COLUMN ${jsonSchema.compMod.oldField.name} TO ${jsonSchema.compMod.newField.name};`,
			);

		const nameToJsonSchemaPairs = _.toPairs(collection.properties);

		const changeTypeScripts = nameToJsonSchemaPairs
			.filter(([name, jsonSchema]) => checkFieldPropertiesChanged(jsonSchema.compMod, ['type', 'mode']))
			.map(
				([name, jsonSchema]) =>
					`ALTER TABLE IF EXISTS ${fullName} ALTER COLUMN ${name} SET DATA TYPE ${
						jsonSchema.compMod.newField.mode || jsonSchema.compMod.newField.type
					};`,
			);

		const changeTagScripts = nameToJsonSchemaPairs.reduce((result, [name, jsonSchema]) => {
			const tags = jsonSchema.columnTags;
			const oldTags = collection.role?.properties?.[name]?.columnTags;
			const isCaseSensitive = collection.role?.isCaseSensitive;
			const tagsToSet = getSetTagValue({ tags, oldTags, isCaseSensitive });
			const tagsToUnset = getUnsetTagValue({ tags, oldTags, isCaseSensitive });

			if (tagsToSet) {
				result.push(`ALTER TABLE IF EXISTS ${fullName} MODIFY COLUMN ${name} SET ${tagsToSet};`);
			}

			if (tagsToUnset) {
				result.push(`ALTER TABLE IF EXISTS ${fullName} MODIFY COLUMN ${name} UNSET ${tagsToUnset};`);
			}

			return result;
		}, []);

		const modifyCommentScripts = nameToJsonSchemaPairs
			.map(([name, jsonSchema]) => {
				const columnName = getName(collectionSchema.isCaseSensitive, name);

				const comment = jsonSchema.description;
				const oldComment = collection.role?.properties?.[name]?.description;

				// comment was removed
				if (oldComment && !comment) {
					return assignTemplates(templates.alterTable, {
						name: fullName,
						action: `MODIFY COLUMN ${columnName} UNSET COMMENT`,
					});
				}

				// new or modified comment
				if (oldComment !== comment) {
					return assignTemplates(templates.alterTable, {
						name: fullName,
						action: `MODIFY COLUMN ${columnName} COMMENT = ${escapeString(scriptFormat, comment)}`,
					});
				}
			})
			.filter(Boolean);

		return [...renameColumnScripts, ...changeTypeScripts, ...changeTagScripts, ...modifyCommentScripts];
	};

const getModifyCollectionKeysScript = collection => {
	const modifyPkScriptDtos = getModifyPkScripts(collection);
	const modifyUkScriptDtos = getModifyUkScripts(collection);

	const allScriptDtos = [...modifyPkScriptDtos, ...modifyUkScriptDtos];

	return allScriptDtos
		.flatMap(dto => {
			if (!dto?.scripts) {
				return [];
			}
			return dto.scripts.map(scriptObj => {
				const script = scriptObj.script;
				if (!script) {
					return null;
				}
				// Handle deactivated scripts by commenting them out
				return commentIfDeactivated(script, { isActivated: dto.isActivated });
			});
		})
		.filter(Boolean);
};

module.exports = {
	getAddCollectionScript,
	getDeleteCollectionScript,
	getAddColumnScript,
	getDeleteColumnScript,
	getModifyColumnScript,
	getModifyCollectionScript,
	getModifyCollectionKeysScript,
};
