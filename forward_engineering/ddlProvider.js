/*
 * Copyright © 2016-2023 by IntegrIT S.A. dba Hackolade.  All rights reserved.
 *
 * The copyright to the computer software herein is the property of IntegrIT S.A.
 * The software may be used and/or copied only with the written permission of
 * IntegrIT S.A. or in accordance with the terms and conditions stipulated in
 * the agreement/contract under which the software has been supplied.
 */

const defaultTypes = require('./configs/defaultTypes');
const types = require('./configs/types');
const templates = require('./configs/templates');

const {
	prepareAlterSetUnsetData,
	prepareContainerName,
	prepareMenageContainerData,
	prepareName,
} = require('./helpers/alterScriptHelpers/common')

const DEFAULT_SNOWFLAKE_SEQUENCE_START = 1;
const DEFAULT_SNOWFLAKE_SEQUENCE_INCREMENT = 1;

const snowflakeProvider = (baseProvider, options, app) => {
	const _ = app.require('lodash');

	const keyHelper = require('./helpers/keyHelper')(_, app);
	const getFormatTypeOptions = require('./helpers/getFormatTypeOptions')(_, app);
	const { getStageCopyOptions } = require('./helpers/getStageCopyOptions')(_, app);

	const {
		toString,
		toBoolean,
		composeClusteringKey,
		foreignKeysToString,
		checkIfForeignKeyActivated,
		foreignActiveKeysToString,
		getName,
		getFullName,
		getDbName
	} = require('./helpers/general')(_, app);

	const {
		decorateType,
		getDefault,
		getAutoIncrement,
		getCollation,
		getInlineConstraint,
		createExternalColumn,
	} = require('./helpers/columnDefinitionHelper')(_, app);

	const alterStatements = require('./helpers/alterStatements')(_, app);
	const createStatements = require('./helpers/createStatements')(_, app);
	const { generateConstraint } = require('./helpers/constraintHelper')(_, app);
	const { commentIfDeactivated } = require('./helpers/commentDeactivatedHelper')(_);

	const { tab, hasType, clean } = app.require('@hackolade/ddl-fe-utils').general;
	const assignTemplates = app.require('@hackolade/ddl-fe-utils').assignTemplates;

	const {
		getAlterSchemaName,
		getSetCollectionProperty,
		getUnsetCollectionProperty,
		getSchemaMenageAccess,
		getAlterSchemaScript,
	} = require('./helpers/alterScriptHelpers/commonScript')({ getName, getFullName, templates, assignTemplates, tab, _ });

	let statementCreator = options.isUpdate || options.isUpdateScript ? alterStatements : createStatements;

	return statementCreator({
		createForeignKeyConstraint(fkData, dbData, schemaData) {
			const isRelationActivated = checkIfForeignKeyActivated(fkData);
			const foreignKeys = isRelationActivated
				? foreignKeysToString(fkData.foreignTableIsCaseSensitive, fkData.foreignKey)
				: foreignActiveKeysToString(fkData.foreignTableIsCaseSensitive, fkData.foreignKey);
			const primaryKeys = isRelationActivated
				? foreignKeysToString(fkData.primaryTableIsCaseSensitive, fkData.primaryKey)
				: foreignActiveKeysToString(fkData.primaryTableIsCaseSensitive, fkData.primaryKey);

			const foreignKeyStatement = assignTemplates(templates.createTableForeignKey, {
				constraint: fkData.name ? `CONSTRAINT ${getName(schemaData.isCaseSensitive, fkData.name)} ` : '',
				columns: foreignKeys,
				primary_table: getFullName(
					fkData.primarySchemaName || schemaData.schemaName,
					getName(fkData.primaryTableIsCaseSensitive, fkData.primaryTable),
				),
				primary_columns: primaryKeys,
			});

			return {
				statement: foreignKeyStatement,
				isActivated: isRelationActivated,
			};
		},

		createForeignKey(fkData, dbData, schemaData) {
			const isRelationActivated = checkIfForeignKeyActivated(fkData);
			const foreignKeys = isRelationActivated
				? foreignKeysToString(fkData.foreignTableIsCaseSensitive, fkData.foreignKey)
				: foreignActiveKeysToString(fkData.foreignTableIsCaseSensitive, fkData.foreignKey);
			const primaryKeys = isRelationActivated
				? foreignKeysToString(fkData.primaryTableIsCaseSensitive, fkData.primaryKey)
				: foreignActiveKeysToString(fkData.primaryTableIsCaseSensitive, fkData.primaryKey);

			const foreignKeyStatement = assignTemplates(templates.alterTableForeignKey, {
				constraint: fkData.name ? `CONSTRAINT ${getName(schemaData.isCaseSensitive, fkData.name)} ` : '',
				table_name: getFullName(
					schemaData.schemaName,
					getName(fkData.foreignTableIsCaseSensitive, fkData.foreignTable),
				),
				columns: foreignKeys,
				primary_table: getFullName(
					schemaData.schemaName,
					getName(fkData.primaryTableIsCaseSensitive, fkData.primaryTable),
				),
				primary_columns: primaryKeys,
			});

			return {
				statement: foreignKeyStatement,
				isActivated: isRelationActivated,
			};
		},

		convertColumnDefinition(columnDefinition) {
			const columnStatement = assignTemplates(templates.columnDefinition, {
				name: columnDefinition.name,
				type: decorateType(columnDefinition.type, columnDefinition),
				collation: getCollation(columnDefinition.type, columnDefinition.collation),
				default: !_.isUndefined(columnDefinition.default)
					? ' DEFAULT ' + getDefault(columnDefinition.type, columnDefinition.default)
					: '',
				autoincrement: getAutoIncrement(columnDefinition.type, 'AUTOINCREMENT', columnDefinition.autoincrement),
				identity: getAutoIncrement(columnDefinition.type, 'IDENTITY', columnDefinition.identity),
				not_nul: !columnDefinition.nullable ? ' NOT NULL' : '',
				inline_constraint: getInlineConstraint(columnDefinition),
				comment: columnDefinition.comment ? ` COMMENT $$${columnDefinition.comment}$$` : '',
			});
			return { statement: columnStatement, isActivated: columnDefinition.isActivated };
		},

		hydrateSchema(containerData, { udfs, procedures, sequences, fileFormats, stages } = {}) {
			return {
				schemaName: getName(containerData.isCaseSensitive, containerData.name),
				isCaseSensitive: containerData.isCaseSensitive,
				databaseName: containerData.database,
				comment: containerData.description,
				transient: containerData.transient,
				managedAccess: containerData.managedAccess,
				dataRetention: containerData.DATA_RETENTION_TIME_IN_DAYS,
				udfs: Array.isArray(udfs)
					? udfs
						.map(udf =>
							clean({
								name: udf.name || undefined,
								orReplace: udf.orReplace || undefined,
								language: udf.functionLanguage || udf.storedProcLanguage || undefined,
								runtimeVersion: udf.runtimeVersion || undefined,
								packages: udf.packages || undefined,
								arguments: udf.functionArguments || udf.storedProcArgument || undefined,
								returnType: udf.functionReturnType || udf.storedProcDataType || undefined,
								notNull: udf.notNull || undefined,
								function:
									udf.functionBody || udf.storedProcFunction
										? tab(_.trim(udf.functionBody || udf.storedProcFunction))
										: undefined,
								comment:
									udf.functionDescription || udf.storedProcDescription
										? `${udf.functionDescription || udf.storedProcDescription}`
										: '',
							}),
						)
						.filter(udf => udf.name && udf.language && udf.returnType && udf.function)
					: [],
				procedures: Array.isArray(procedures)
					? procedures
						.map(procedure =>
							clean({
								name: procedure.name || undefined,
								orReplace: procedure.orReplace || undefined,
								args: procedure.inputArgs || undefined,
								returnType: procedure.returnType || undefined,
								notNull: procedure.notNull || undefined,
								language: procedure.language || undefined,
								runtimeVersion: procedure.runtimeVersion || undefined,
								packages: procedure.packages || undefined,
								handler: procedure.handler || undefined,
								body: procedure.body ? tab(_.trim(procedure.body)) : undefined,
								description: procedure.description || undefined,
							}),
						)
						.filter(procedure => procedure.name)
					: [],
				sequences: Array.isArray(sequences)
					? sequences
						.map(sequence =>
							clean({
								name: sequence.name || undefined,
								start: sequence.sequenceStart || DEFAULT_SNOWFLAKE_SEQUENCE_START,
								increment: sequence.sequenceIncrement || DEFAULT_SNOWFLAKE_SEQUENCE_INCREMENT,
								comment: sequence.sequenceComments
									? ` COMMENT=$$${sequence.sequenceComments}$$`
									: '',
							}),
						)
						.filter(sequence => sequence.name)
					: [],
				fileFormats: Array.isArray(fileFormats)
					? fileFormats
						.map(fileFormat =>
							clean({
								name: fileFormat.name || undefined,
								type: fileFormat.fileFormat,
								formatTypeOptions: clean(
									getFormatTypeOptions(fileFormat.fileFormat, fileFormat.formatTypeOptions),
								),
								comment: fileFormat.fileFormatComments
									? ` COMMENT=$$${fileFormat.fileFormatComments}$$`
									: '',
							}),
						)
						.filter(fileFormat => fileFormat.name)
					: [],
				stages: Array.isArray(stages)
					? stages
						.map(stage =>
							clean({
								name: stage.name || undefined,
								temporary: stage.temporary,
								url: stage.url,
								storageIntegration: stage.storageIntegration,
								credentials: stage.credentials,
								encryption: stage.encryption,
							}),
						)
						.filter(stage => stage.name)
					: [],
			};
		},
		hydrateTable({ tableData, entityData, jsonSchema }) {
			const keyConstraints = keyHelper.getTableKeyConstraints({ jsonSchema });
			const firstTab = _.get(entityData, '[0]', {});
			const getLocation = location => {
				return location.namespace ? location.namespace + location.path : location.path;
			};
			const fileFormat = firstTab.external ? firstTab.externalFileFormat : firstTab.fileFormat;
			const entityLevelCompositePrimaryKeys = keyConstraints
				.filter(({ keyType }) => keyType === 'PRIMARY KEY')
				.reduce((keys, data) => {
					return {
						...keys,
						[data.name]: data.columns.map(column => {
							return { name: column.name, isActivated: column.isActivated };
						}),
					};
				}, {});

			const entityLevelCompositeUniqueKeys = keyConstraints
				.filter(({ keyType }) => keyType === 'UNIQUE')
				.reduce((keys, data) => {
					return {
						...keys,
						[data.name]: data.columns.map(column => {
							return { name: column.name, isActivated: column.isActivated };
						}),
					};
				}, {});

			const compositePrimaryKeys = tableData.columnDefinitions
				.filter(column => column.compositePrimaryKey)
				.reduce((result, column) => {
					if (!column.primaryKeyConstraintName) {
						return result;
					}

					return {
						...result,
						[column.primaryKeyConstraintName]: Array.isArray(result[column.primaryKeyConstraintName])
							? _.uniqBy(
								[
									...result[column.primaryKeyConstraintName],
									{ name: column.name, isActivated: column.isActivated },
								],
								'name',
							)
							: [{ name: column.name, isActivated: column.isActivated }],
					};
				}, entityLevelCompositePrimaryKeys);

			const compositeUniqueKeys = tableData.columnDefinitions
				.filter(column => column.compositeUniqueKey)
				.reduce((result, column) => {
					if (!column.uniqueKeyConstraintName) {
						return result;
					}

					return {
						...result,
						[column.uniqueKeyConstraintName]: Array.isArray(result[column.uniqueKeyConstraintName])
							? _.uniqBy(
								[
									...result[column.uniqueKeyConstraintName],
									{ name: column.name, isActivated: column.isActivated },
								],
								'name',
							)
							: [{ name: column.name, isActivated: column.isActivated }],
					};
				}, entityLevelCompositeUniqueKeys);

			return {
				...tableData,
				name: getName(firstTab.isCaseSensitive, tableData.name),
				temporary: firstTab.temporary,
				transient: firstTab.transient,
				external: firstTab.external,
				selectStatement: firstTab.selectStatement,
				isCaseSensitive: firstTab.isCaseSensitive,
				clusteringKey: Array.isArray(firstTab.clusteringKey)
					? firstTab.clusteringKey
						.map(key => composeClusteringKey(firstTab.isCaseSensitive, jsonSchema, key))
						.filter(Boolean)
					: [],
				partitioningKey: firstTab.partitioningKey,
				comment: firstTab.description,
				copyGrants: firstTab.copyGrants,
				dataRetentionTime: !isNaN(firstTab.DATA_RETENTION_TIME_IN_DAYS)
					? firstTab.DATA_RETENTION_TIME_IN_DAYS
					: '',
				fileFormat: fileFormat,
				formatName: firstTab.customFileFormatName,
				formatTypeOptions: _.isEmpty(firstTab.formatTypeOptions)
					? {}
					: clean(getFormatTypeOptions(fileFormat, firstTab.formatTypeOptions)),
				copyOptions: _.isEmpty(firstTab.stageCopyOptions)
					? {}
					: clean(getStageCopyOptions(firstTab.stageCopyOptions)),
				cloneTableName: getName(
					firstTab.isCaseSensitive,
					_.get(tableData, `relatedSchemas[${firstTab.clone}].code`, ''),
				),
				likeTableName: getName(
					firstTab.isCaseSensitive,
					_.get(tableData, `relatedSchemas[${firstTab.like}].code`, ''),
				),
				cloneParams: _.isEmpty(firstTab.cloneParams)
					? {}
					: {
						atOrBefore: _.toUpper(firstTab.cloneParams.atOrBefore),
						TIMESTAMP: firstTab.cloneParams.TIMESTAMP,
						OFFSET: firstTab.cloneParams.OFFSET,
						STATEMENT: firstTab.cloneParams.STATEMENT,
					},
				externalOptions: {
					location: _.isPlainObject(firstTab.location) ? getLocation(firstTab.location) : '',
					REFRESH_ON_CREATE: toBoolean(firstTab.REFRESH_ON_CREATE),
					AUTO_REFRESH: toBoolean(firstTab.AUTO_REFRESH),
					PATTERN: firstTab.PATTERN ? toString(firstTab.PATTERN) : '',
				},
				columns: firstTab.external ? tableData.columnDefinitions.map(createExternalColumn) : tableData.columns,
				compositePrimaryKeys: Object.entries(compositePrimaryKeys).map(([name, keys]) =>
					generateConstraint({
						name,
						keys,
						keyType: 'PRIMARY KEY',
						isActivated: jsonSchema.isActivated,
						isCaseSensitive: firstTab.isCaseSensitive,
					}),
				),
				compositeUniqueKeys: Object.entries(compositeUniqueKeys).map(([name, keys]) =>
					generateConstraint({
						name,
						keys,
						keyType: 'UNIQUE',
						isActivated: jsonSchema.isActivated,
						isCaseSensitive: firstTab.isCaseSensitive,
					}),
				),
			};
		},

		hydrateView({ viewData, entityData }) {
			const firstTab = entityData[0];

			return {
				...viewData,
				name: getName(firstTab.isCaseSensitive, viewData.name),
				selectStatement: firstTab.selectStatement,
				isCaseSensitive: firstTab.isCaseSensitive,
				copyGrants: firstTab.copyGrants,
				comment: firstTab.description,
				secure: firstTab.secure,
				materialized: firstTab.materialized,
			};
		},

		hydrateViewColumn(data) {
			if (!data.entityName) {
				return data;
			}

			return {
				...data,
				name: getName(data.definition?.isCaseSensitive, data.name),
				dbName: getName(_.first(data.containerData)?.isCaseSensitive, data.dbName),
				entityName: getName(_.first(data.entityData)?.isCaseSensitive, data.entityName),
			};
		},

		hydrateColumn({ columnDefinition, jsonSchema, dbData }) {
			return Object.assign({}, columnDefinition, {
				name: getName(jsonSchema.isCaseSensitive, columnDefinition.name),
				isCaseSensitive: jsonSchema.isCaseSensitive,
				timePrecision: Number(jsonSchema.tPrecision),
				autoincrement:
					jsonSchema.defaultOption === 'Autoincrement' && jsonSchema.autoincrement
						? {
							start: _.get(jsonSchema, 'autoincrement.start_num'),
							step: _.get(jsonSchema, 'autoincrement.step_num'),
						}
						: false,
				identity:
					jsonSchema.defaultOption === 'Identity' && jsonSchema.identity
						? {
							start: _.get(jsonSchema, 'identity.start_num'),
							step: _.get(jsonSchema, 'identity.step_num'),
						}
						: false,
				collation: jsonSchema.collate
					? clean({
						locale: jsonSchema.locale,
						caseSensitivity: jsonSchema.caseSensitivity,
						accentSensitivity: jsonSchema.accentSensitivity,
						punctuationSensitivity: jsonSchema.punctuationSensitivity,
						firstLetterPreference: jsonSchema.firstLetterPreference,
						caseConversion: jsonSchema.caseConversion,
						spaceTrimming: jsonSchema.spaceTrimming,
					})
					: {},
				comment: jsonSchema.refDescription || jsonSchema.description,
				unique: jsonSchema.uniqueKeyConstraintName ? false : jsonSchema.unique,
				primaryKeyConstraintName: jsonSchema.primaryKeyConstraintName,
				compositePrimaryKey:
					jsonSchema.compositePrimaryKey || (jsonSchema.primaryKeyConstraintName && jsonSchema.primaryKey),
				compositeUniqueKey:
					jsonSchema.compositeUniqueKey || (jsonSchema.uniqueKeyConstraintName && jsonSchema.unique),
				uniqueKeyConstraintName: jsonSchema.uniqueKeyConstraintName,
				primaryKey: jsonSchema.primaryKeyConstraintName ? false : columnDefinition.primaryKey,
				expression: jsonSchema.expression,
			});
		},

		getDefaultType(type) {
			return defaultTypes[type];
		},

		getTypesDescriptors() {
			return types;
		},

		hasType(type) {
			return hasType(types, type);
		},

		commentIfDeactivated(statement, data, isPartOfLine) {
			return commentIfDeactivated(statement, data, isPartOfLine);
		},

		hydrateForDeleteSchema(containerData) {
			const containerName = getName(containerData.isCaseSensitive,  getDbName(containerData));
			const databaseName = getName(containerData.isCaseSensitive, containerData.database);
			const name = getFullName(databaseName, containerName);

			return { name };
		},

		hydrateAlterSchema(schema) {
			const preparedData = _.flow(
				prepareName,
				prepareContainerName,
				prepareAlterSetUnsetData,
				prepareMenageContainerData,
			)({ collection: schema, data: {} });

			return preparedData.data
		},

		alterSchema(data) {
			const alterSchemaScript = getAlterSchemaScript(data?.nameData);
			const { script } = _.flow(
				getAlterSchemaName,
				getSetCollectionProperty(alterSchemaScript),
				getUnsetCollectionProperty(alterSchemaScript),
				getSchemaMenageAccess(alterSchemaScript),
			)({ data, script: [] });

			return script.join('\n')
		},
	});
};

module.exports = snowflakeProvider;
