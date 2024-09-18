/**
 * @typedef {import('./types').Tag} Tag
 */

const _ = require('lodash');
const defaultTypes = require('./configs/defaultTypes');
const types = require('./configs/types');
const templates = require('./configs/templates');
const { LANGUAGES, FORMATS } = require('./helpers/constants');
const {
	prepareAlterSetUnsetData,
	prepareContainerName,
	prepareMenageContainerData,
	prepareName,
	prepareTableName,
	prepareCollectionFileFormat,
	prepareCollectionFormatTypeOptions,
	prepareCollectionStageCopyOptions,
} = require('./helpers/alterScriptHelpers/common');
const { escapeString } = require('./utils/escapeString');

const DEFAULT_SNOWFLAKE_SEQUENCE_START = 1;
const DEFAULT_SNOWFLAKE_SEQUENCE_INCREMENT = 1;

module.exports = (baseProvider, options, app) => {
	const assignTemplates = app.require('@hackolade/ddl-fe-utils').assignTemplates;
	const { tab, hasType, clean } = app.require('@hackolade/ddl-fe-utils').general;
	const scriptFormat = options?.targetScriptOptions?.keyword || FORMATS.SNOWSIGHT;

	const keyHelper = require('./helpers/keyHelper')(app);
	const { getFileFormat, getCopyOptions, addOptions, getAtOrBefore, mergeKeys, getDynamicTableProps } =
		require('./helpers/tableHelper')(app);
	const getFormatTypeOptions = require('./helpers/getFormatTypeOptions')(app);
	const { getStageCopyOptions } = require('./helpers/getStageCopyOptions')(app);

	const {
		toString,
		toBoolean,
		composeClusteringKey,
		foreignKeysToString,
		checkIfForeignKeyActivated,
		foreignActiveKeysToString,
		getName,
		getFullName,
		getDbName,
		viewColumnsToString,
	} = require('./helpers/general')(app);

	const { decorateType, getDefault, getAutoIncrement, getCollation, getInlineConstraint, createExternalColumn } =
		require('./helpers/columnDefinitionHelper')(app);

	const { generateConstraint } = require('./helpers/constraintHelper')(app);
	const { commentIfDeactivated } = require('./helpers/commentHelpers/commentDeactivatedHelper');

	const {
		getAlterSchemaName,
		getSetCollectionProperty,
		getUnsetCollectionProperty,
		getSchemaMenageAccess,
		getAlterSchemaScript,
		getAlterEntityRename,
		getAlterTableFormat,
		getAlterTableStageCopyOptions,
		getAlterEntityScript,
		getAlterObjectTagsScript,
	} = require('./helpers/alterScriptHelpers/commonScript')({
		getName,
		getFullName,
		templates,
		assignTemplates,
		tab,
	});

	const { getTagStatement, getTagAllowedValues, getTagKeyValues, prepareObjectTagsData, isEmptyTags } =
		require('./helpers/tagHelper')({
			getName,
			toString,
		});

	const getOutOfLineConstraints = (
		isParentActivated,
		foreignKeyConstraints = [],
		primaryKeyConstraints = [],
		uniqueKeyConstraints = [],
	) => {
		const constraints = [...foreignKeyConstraints, ...primaryKeyConstraints, ...uniqueKeyConstraints].map(
			constraint =>
				isParentActivated ? commentIfDeactivated(constraint.statement, constraint) : constraint.statement,
		);

		return !_.isEmpty(constraints) ? ',\n\t\t' + constraints.join(',\n\t\t') : '';
	};

	function insertNewlinesAtEdges(input) {
		input = input.replace(/^(\$\$|')/, match => match + '\n');
		input = input.replace(/(\$\$|')$/, match => '\n\t' + match);

		return input;
	}

	const getOrReplaceStatement = isEnabled => (isEnabled ? ' OR REPLACE' : '');
	const getBodyStatement = body => (body ? `\n\t${insertNewlinesAtEdges(escapeString(scriptFormat, body))}` : '');
	const getCommentsStatement = text => (text ? `\n\tCOMMENT = '${text}'` : '');
	const getNotNullStatement = isEnabled => (isEnabled ? '\n\tNOT NULL' : '');
	const getIfNotExistStatement = ifNotExist => (ifNotExist ? ' IF NOT EXISTS' : '');

	return {
		createSchema({
			schemaName,
			databaseName,
			transient,
			managedAccess,
			dataRetention,
			comment,
			udfs,
			procedures,
			sequences,
			fileFormats,
			stages,
			isCaseSensitive,
			tags,
			schemaTags,
		}) {
			const transientStatement = transient ? ' TRANSIENT' : '';
			const dataRetentionStatement =
				!isNaN(dataRetention) && dataRetention ? `\n\tDATA_RETENTION_TIME_IN_DAYS=${dataRetention}` : '';
			const managedAccessStatement = managedAccess ? '\n\tWITH MANAGED ACCESS' : '';
			const commentStatement = comment ? `\n\tCOMMENT=${escapeString(scriptFormat, comment)}` : '';
			const currentSchemaName = getName(isCaseSensitive, schemaName);
			const currentDatabaseName = getName(isCaseSensitive, databaseName);
			const fullName = getFullName(currentDatabaseName, currentSchemaName);
			const schemaStatement = assignTemplates(templates.createSchema, {
				name: fullName,
				transient: transientStatement,
				managed_access: managedAccessStatement,
				data_retention: dataRetentionStatement,
				comment: commentStatement,
			});

			const getParameters = payload => {
				if (!payload) {
					return;
				}

				const { language, runtimeVersion, handler, packages } = payload;
				const languagesWithoutParams = [LANGUAGES.SQL, LANGUAGES.JAVASCRIPT];
				if (languagesWithoutParams.includes(language)) {
					return;
				}

				const runtimeVersionStatement = runtimeVersion ? `\n\tRUNTIME_VERSION = '${runtimeVersion}'` : '';

				const handlerStatement = handler ? `\n\tHANDLER = '${handler}'` : '';

				const joinPackages = () => packages.map(({ packageName }) => `'${packageName}'`).join(', ');
				const packagesStatement = packages ? `\n\tPACKAGES = (${joinPackages()})` : '';

				return `${runtimeVersionStatement}${handlerStatement}${packagesStatement}`;
			};

			const userDefinedFunctions = udfs.map(udf =>
				assignTemplates(templates.createUDF, {
					name: getFullName(currentSchemaName, getName(isCaseSensitive, udf.name)),
					arguments: (udf.arguments || '').replace(/^\(([\s\S]+)\)$/, '$1'),
					returnType: udf.returnType,
					language: udf.language,
					body: getBodyStatement(udf.function),
					comment: getCommentsStatement(udf.comment),
					orReplace: getOrReplaceStatement(udf.orReplace),
					parameters: getParameters(udf),
					notNull: getNotNullStatement(udf.notNull),
				}),
			);

			const proceduresStatements = procedures.map(
				({
					name,
					orReplace,
					args,
					returnType,
					language,
					runtimeVersion,
					packages,
					handler,
					body,
					description,
					notNull,
				}) =>
					assignTemplates(templates.createProcedure, {
						orReplace: getOrReplaceStatement(orReplace),
						name: getFullName(currentSchemaName, getName(isCaseSensitive, name)),
						arguments: (args || '').replace(/^\(([\s\S]+)\)$/, '$1'),
						returnType,
						language,
						parameters: getParameters({ language, runtimeVersion, handler, packages }),
						comment: getCommentsStatement(description),
						body: getBodyStatement(body),
						notNull: getNotNullStatement(notNull),
					}),
			);

			const sequencesStatements = sequences.map(sequence =>
				assignTemplates(templates.createSequence, {
					name: getFullName(currentSchemaName, getName(isCaseSensitive, sequence.name)),
					start: sequence.start,
					increment: sequence.increment,
					comment: sequence.comment,
				}),
			);

			const fileFormatsStatements = fileFormats.map(fileFormat =>
				assignTemplates(templates.createFileFormat, {
					name: getFullName(currentSchemaName, getName(isCaseSensitive, fileFormat.name)),
					options: getFileFormat(fileFormat.type, fileFormat.formatTypeOptions).slice(1, -1),
					comment: fileFormat.comment,
				}),
			);

			const stagesStatements = stages.map(stage =>
				assignTemplates(templates.createStage, {
					name: getFullName(currentSchemaName, getName(isCaseSensitive, stage.name)),
					temporary: stage.temporary ? ' TEMPORARY' : '',
					url: stage.url ? `\n\tURL=${stage.url}` : '',
					storageIntegration: stage.storageIntegration
						? `\n\tSTORAGE_INTEGRATION=${stage.storageIntegration}`
						: '',
					credentials: stage.credentials ? `\n\tCREDENTIALS=(${stage.credentials})` : '',
					encryption: stage.encryption ? `\n\tENCRYPTION=(${stage.encryption})` : '',
				}),
			);

			const tagsStatements = tags.map(tag =>
				this.createTag({ tag, schemaName: currentSchemaName, isCaseSensitive }),
			);

			if (!isEmptyTags({ tags: schemaTags })) {
				const schemaTagStatement = assignTemplates(templates.alterSchema, {
					name: fullName,
					operation: 'SET TAG',
					options: getTagKeyValues({ tags: schemaTags, isCaseSensitive }),
				});

				tagsStatements.push(schemaTagStatement);
			}

			const statements = [];

			if (databaseName) {
				statements.push(
					assignTemplates(templates.createDatabase, { name: getName(isCaseSensitive, databaseName) }),
				);
			}

			statements.push(schemaStatement);

			return [
				...statements,
				...userDefinedFunctions,
				...proceduresStatements,
				...sequencesStatements,
				...fileFormatsStatements,
				...stagesStatements,
				...tagsStatements,
			].join('\n');
		},

		hydrateJsonSchemaColumn(jsonSchema, definitionJsonSchema) {
			if (jsonSchema.type === 'variant') {
				return _.omit(jsonSchema, ['subtype', 'mode']);
			}

			return jsonSchema;
		},

		createTable(tableData, isActivated) {
			const schemaName = _.get(tableData, 'schemaData.schemaName');
			const temporary = tableData.temporary ? ' TEMPORARY' : '';
			const transient = tableData.transient && !tableData.temporary ? ' TRANSIENT' : '';
			const orReplace = tableData.orReplace ? ' OR REPLACE' : '';
			const tableIfNotExists = tableData.tableIfNotExists ? ' IF NOT EXISTS' : '';
			const clusterKeys = !_.isEmpty(tableData.clusteringKey)
				? ' CLUSTER BY (' +
					(isActivated
						? foreignKeysToString(tableData.isCaseSensitive, tableData.clusteringKey)
						: foreignActiveKeysToString(tableData.isCaseSensitive, tableData.clusteringKey)) +
					')'
				: '';
			const partitionKeys = !_.isEmpty(tableData.partitioningKey)
				? ' PARTITION BY (' +
					(isActivated
						? foreignKeysToString(
								tableData.isCaseSensitive,
								tableData.partitioningKey.map(key => ({
									name: `${getName(tableData.isCaseSensitive, key.name)}`,
									isActivated: key.isActivated,
								})),
							)
						: mergeKeys(tableData.partitioningKey)) +
					')'
				: '';
			const comment = tableData.comment ? ` COMMENT=${escapeString(scriptFormat, tableData.comment)}` : '';
			const copyGrants = tableData.copyGrants ? ` COPY GRANTS` : '';
			const dataRetentionTime = tableData.dataRetentionTime
				? ` DATA_RETENTION_TIME_IN_DAYS=${tableData.dataRetentionTime}`
				: '';
			const stageFileFormat = tableData.fileFormat
				? tab(
						'STAGE_FILE_FORMAT = ' +
							getFileFormat(tableData.fileFormat, tableData.formatTypeOptions, tableData.formatName),
						' ',
					)
				: '';
			const fileFormat = tableData.fileFormat
				? tab(
						'FILE_FORMAT = ' +
							getFileFormat(tableData.fileFormat, tableData.formatTypeOptions, tableData.formatName),
						' ',
					)
				: '';
			const copyOptions = tab(getCopyOptions(tableData.copyOptions), ' ');
			const atOrBefore = tab(getAtOrBefore(tableData.cloneParams), ' ');
			const columnDefinitions = tableData.columns
				.map(column => commentIfDeactivated(column.statement, column))
				.join(',\n\t\t');
			const tagsStatement = getTagStatement({
				tags: tableData.tableTags,
				isCaseSensitive: tableData.isCaseSensitive,
			});

			if (tableData.dynamic) {
				const dynamicTableOptions = getDynamicTableProps({
					iceberg: tableData.iceberg,
					tableData,
					tagsStatement,
					clusterKeys,
					comment,
					dataRetentionTime,
					copyGrants,
					columnDefinitions,
				});

				return assignTemplates(templates.createDynamicTable, {
					orReplace,
					tableIfNotExists,
					name: tableData.fullName,
					transient,
					...dynamicTableOptions,
				});
			} else if (tableData.selectStatement) {
				return assignTemplates(templates.createAsSelect, {
					name: tableData.fullName,
					selectStatement: tableData.selectStatement,
					tableOptions: addOptions([clusterKeys, copyGrants, tagsStatement]),
				});
			} else if (tableData.cloneTableName) {
				return assignTemplates(templates.createCloneTable, {
					name: tableData.fullName,
					source_table: getFullName(schemaName, tableData.cloneTableName),
					tableOptions: addOptions([atOrBefore, copyGrants, tagsStatement]),
				});
			} else if (tableData.likeTableName) {
				return assignTemplates(templates.createLikeTable, {
					name: tableData.fullName,
					source_table: getFullName(schemaName, tableData.likeTableName),
					tableOptions: addOptions([clusterKeys, copyGrants, tagsStatement]),
				});
			} else if (tableData.external) {
				const location = tableData.externalOptions.location
					? ' WITH LOCATION=' + tableData.externalOptions.location
					: '';
				const refreshOnCreate = tableData.externalOptions.REFRESH_ON_CREATE
					? ' REFRESH_ON_CREATE=' + tableData.externalOptions.REFRESH_ON_CREATE
					: '';
				const autoRefresh = tableData.externalOptions.AUTO_REFRESH
					? ' AUTO_REFRESH=' + tableData.externalOptions.AUTO_REFRESH
					: '';
				const pattern = tableData.externalOptions.PATTERN
					? ' PATTERN=' + tableData.externalOptions.PATTERN
					: '';

				return assignTemplates(templates.createExternalTable, {
					name: tableData.fullName,
					tableOptions: addOptions(
						[
							partitionKeys,
							fileFormat,
							location,
							refreshOnCreate,
							autoRefresh,
							pattern,
							copyGrants,
							tagsStatement,
						],
						comment,
					),

					column_definitions: columnDefinitions,
					out_of_line_constraints: getOutOfLineConstraints(
						isActivated,
						tableData.foreignKeyConstraints,
						tableData.compositePrimaryKeys,
						tableData.compositeUniqueKeys,
					),
				});
			}

			return assignTemplates(templates.createTable, {
				name: tableData.fullName,
				temporary,
				transient,
				tableOptions: addOptions(
					[clusterKeys, stageFileFormat, copyOptions, dataRetentionTime, copyGrants, tagsStatement],
					comment,
				),
				column_definitions: columnDefinitions,
				out_of_line_constraints: getOutOfLineConstraints(
					isActivated,
					tableData.foreignKeyConstraints,
					tableData.compositePrimaryKeys,
					tableData.compositeUniqueKeys,
				),
			});
		},

		convertColumnDefinition(columnDefinition) {
			const columnStatement = assignTemplates(templates.columnDefinition, {
				name: columnDefinition.name,
				type: decorateType(columnDefinition.type, columnDefinition),
				collation: getCollation(columnDefinition.type, columnDefinition.collation),
				default: !_.isUndefined(columnDefinition.default)
					? ' DEFAULT ' +
						getDefault({
							scriptFormat,
							type: columnDefinition.type,
							defaultValue: columnDefinition.default,
						})
					: '',
				autoincrement: getAutoIncrement(columnDefinition.type, 'AUTOINCREMENT', columnDefinition.autoincrement),
				identity: getAutoIncrement(columnDefinition.type, 'IDENTITY', columnDefinition.identity),
				not_nul: !columnDefinition.nullable ? ' NOT NULL' : '',
				inline_constraint: getInlineConstraint(columnDefinition),
				comment: columnDefinition.comment
					? ` COMMENT ${escapeString(scriptFormat, columnDefinition.comment)}`
					: '',
				tag: getTagStatement({
					tags: columnDefinition.columnTags,
					isCaseSensitive: columnDefinition.isCaseSensitive,
				}),
			});
			return { statement: columnStatement, isActivated: columnDefinition.isActivated };
		},

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
					getName(schemaData.isCaseSensitive, fkData.primarySchemaName || schemaData.schemaName),
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
					fkData.foreignSchemaName,
					getName(fkData.foreignTableIsCaseSensitive, fkData.foreignTable),
				),
				columns: foreignKeys,
				primary_table: getFullName(
					fkData.primarySchemaName,
					getName(fkData.primaryTableIsCaseSensitive, fkData.primaryTable),
				),
				primary_columns: primaryKeys,
			});

			return {
				statement: foreignKeyStatement,
				isActivated: isRelationActivated,
			};
		},

		createView(viewData, dbData, isActivated) {
			const schemaName = _.get(viewData, 'schemaData.schemaName');
			const { columnList, tableColumns, tables } = viewData.keys.reduce(
				(result, key) => {
					result.columnList.push({
						name: `${getName(viewData.isCaseSensitive, key.alias || key.name)}`,
						isActivated: key.isActivated,
					});
					result.tableColumns.push({
						name: `${getName(viewData.isCaseSensitive, key.entityName)}.${getName(
							viewData.isCaseSensitive,
							key.name,
						)}`,
						isActivated: key.isActivated,
					});

					if (key.entityName && !result.tables.includes(key.entityName)) {
						result.tables.push(getFullName(key.dbName, key.entityName));
					}

					return result;
				},
				{
					columnList: [],
					tableColumns: [],
					tables: [],
				},
			);

			if (_.isEmpty(tables) && !viewData.selectStatement) {
				return '';
			}

			const selectStatement =
				viewData.selectStatement ||
				`SELECT \n\t${viewColumnsToString(tableColumns, isActivated)}\nFROM ${tables.join(' INNER JOIN ')}`;

			const tagStatement = getTagStatement({
				tags: viewData.viewTags,
				isCaseSensitive: viewData.isCaseSensitive,
				indent: '',
			});

			const clustering = viewData.materialized
				? keyHelper.getClusteringKey({
						clusteringKey: viewData.clusteringKey,
						isParentActivated: isActivated,
					})
				: undefined;

			return assignTemplates(templates.createView, {
				secure: viewData.secure ? ' SECURE' : '',
				materialized: viewData.materialized ? ' MATERIALIZED' : '',
				name: getFullName(schemaName, viewData.name),
				column_list: viewColumnsToString(columnList, isActivated),
				copy_grants: viewData.copyGrants ? 'COPY GRANTS\n' : '',
				comment: viewData.comment ? `COMMENT=${escapeString(scriptFormat, viewData.comment)}\n` : '',
				select_statement: selectStatement,
				tag: tagStatement ? tagStatement + '\n' : '',
				clustering,
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

		hydrateColumn({ columnDefinition, jsonSchema, dbData }) {
			return {
				...columnDefinition,
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
				columnTags: jsonSchema.columnTags ?? [],
			};
		},

		hydrateSchema(containerData, { udfs, procedures, sequences, fileFormats, stages, tags } = {}) {
			return {
				schemaName: getName(containerData.isCaseSensitive, containerData.name),
				isCaseSensitive: containerData.isCaseSensitive,
				databaseName: containerData.database,
				comment: containerData.description,
				transient: containerData.transient,
				managedAccess: containerData.managedAccess,
				dataRetention: containerData.DATA_RETENTION_TIME_IN_DAYS,
				schemaTags: containerData.schemaTags,
				udfs: Array.isArray(udfs)
					? udfs
							.map(udf =>
								clean({
									name: udf.name || undefined,
									orReplace: udf.functionOrReplace || undefined,
									language: udf.functionLanguage || udf.storedProcLanguage || undefined,
									runtimeVersion: udf.functionRuntimeVersion || undefined,
									packages: udf.functionPackages || undefined,
									arguments: udf.functionArguments || udf.storedProcArgument || undefined,
									returnType: udf.functionReturnType || udf.storedProcDataType || undefined,
									notNull: udf.functionNotNull || undefined,
									handler: udf.functionHandler || undefined,
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
										? ` COMMENT=${escapeString(scriptFormat, sequence.sequenceComments)}`
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
										? ` COMMENT=${escapeString(scriptFormat, fileFormat.fileFormatComments)}`
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
				tags: Array.isArray(tags)
					? tags
							.map(tag =>
								clean({
									name: tag.name || undefined,
									orReplace: tag.orReplace || undefined,
									ifNotExist: tag.ifNotExist || undefined,
									allowedValues: tag.allowedValues || undefined,
									description: tag.description || undefined,
								}),
							)
							.filter(tag => tag.name)
					: [],
			};
		},

		hydrateTable({ tableData, entityData, jsonSchema }) {
			const keyConstraints = keyHelper.getTableKeyConstraints({ jsonSchema });
			const firstTab = _.get(entityData, '[0]', {});
			const schemaName = getName(firstTab.isCaseSensitive, _.get(tableData, 'schemaData.schemaName'));
			const databaseName = getName(firstTab.isCaseSensitive, _.get(tableData, 'schemaData.databaseName'));
			const tableName = getName(firstTab.isCaseSensitive, tableData.name);
			const fullName = getFullName(databaseName, getFullName(schemaName, tableName));
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
				fullName,
				name: getName(firstTab.isCaseSensitive, tableData.name),
				temporary: firstTab.temporary,
				transient: firstTab.transient,
				external: firstTab.external,
				dynamicTableProps: {
					iceberg: firstTab.iceberg,
					warehouse: firstTab.warehouse,
					targetLag: firstTab.targetLag,
					refreshMode: firstTab.refreshMode,
					initialize: firstTab.initialize,
					query: firstTab.query,
					externalVolume: firstTab.externalVolume,
					catalog: firstTab.catalog,
					baseLocation: firstTab.baseLocation,
					maxDataExtensionTime: !isNaN(firstTab.MAX_DATA_EXTENSION_TIME_IN_DAYS)
						? firstTab.MAX_DATA_EXTENSION_TIME_IN_DAYS
						: '',
				},
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
				tableTags: firstTab.tableTags ?? [],
			};
		},

		hydrateView({ viewData, entityData }) {
			const firstTab = entityData[0];
			const { databaseName, schemaName } = viewData.schemaData;
			const viewName = getName(firstTab.isCaseSensitive, viewData.name);
			const fullName = getFullName(databaseName, getFullName(schemaName, viewName));

			return {
				...viewData,
				name: getName(firstTab.isCaseSensitive, viewData.name),
				selectStatement: firstTab.selectStatement,
				isCaseSensitive: firstTab.isCaseSensitive,
				copyGrants: firstTab.copyGrants,
				comment: firstTab.description,
				secure: firstTab.secure,
				materialized: firstTab.materialized,
				fullName,
				clusteringKey: firstTab.clusteringKey,
				viewTags: firstTab.viewTags ?? [],
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

		commentIfDeactivated(statement, data, isPartOfLine) {
			return commentIfDeactivated(statement, data, isPartOfLine);
		},

		alterTable(data) {
			if (data.iceberg) {
				return '// Dynamic Iceberg tables are currently only supported for CREATE statements. Specifying DYNAMIC ICEBERG in any other command (for example, ALTER DYNAMIC ICEBERG TABLE <name>) results in an error.';
			}

			const alterTableScript = getAlterEntityScript(templates.alterTableScript, {
				dynamic: data.dynamic,
				...data.nameData,
			});
			const { script } = _.flow(
				getAlterEntityRename(templates.alterTableScript, templates.alterEntityRename),
				getSetCollectionProperty(alterTableScript),
				getUnsetCollectionProperty(alterTableScript),
				getAlterTableFormat(alterTableScript, getFileFormat),
				getAlterTableStageCopyOptions(alterTableScript, getCopyOptions, _),
				getAlterObjectTagsScript(alterTableScript),
			)({ data, script: [] });

			return script.join('\n');
		},

		hydrateAlertTable(collection) {
			const { data } = _.flow(
				prepareName,
				prepareTableName,
				prepareCollectionFileFormat,
				prepareCollectionFormatTypeOptions,
				prepareAlterSetUnsetData,
				prepareCollectionStageCopyOptions(clean, getStageCopyOptions, _),
				prepareObjectTagsData('tableTags'),
			)({ collection, data: {} });

			const formatTypeOptions = clean(
				getFormatTypeOptions(data.formatData.fileFormat, data.formatTypeOptions.typeOptions),
			);

			return {
				...data,
				dynamic: collection.role.dynamic,
				iceberg: collection.compMod?.iceberg?.old || collection.compMod?.iceberg?.new,
				formatTypeOptions: {
					...data.formatTypeOptions,
					typeOptions: formatTypeOptions,
				},
			};
		},

		alterView(data) {
			const { nameData } = data;
			const alterTableTemplateName = nameData.isMaterialized ? 'alterMaterializedViewScript' : 'alterViewScript';
			const alterTableScript = getAlterEntityScript(templates[alterTableTemplateName], nameData);
			const { script } = _.flow(
				getAlterEntityRename(templates[alterTableTemplateName], templates.alterEntityRename),
				getSetCollectionProperty(alterTableScript),
				getUnsetCollectionProperty(alterTableScript),
				getAlterObjectTagsScript(alterTableScript),
			)({ data, script: [] });

			return script.join('\n');
		},

		hydrateAlterView(collection) {
			const { data } = _.flow(
				prepareName,
				prepareTableName,
				prepareAlterSetUnsetData,
				prepareObjectTagsData('viewTags'),
			)({ collection, data: {} });

			return data;
		},

		alterSchema(data) {
			const alterSchemaScript = getAlterSchemaScript(data?.nameData);
			const { script } = _.flow(
				getAlterSchemaName,
				getSetCollectionProperty(alterSchemaScript),
				getUnsetCollectionProperty(alterSchemaScript),
				getSchemaMenageAccess(alterSchemaScript),
				getAlterObjectTagsScript(alterSchemaScript),
			)({ data, script: [] });

			return script.join('\n');
		},

		hydrateAlterSchema(schema) {
			const preparedData = _.flow(
				prepareName,
				prepareContainerName,
				prepareAlterSetUnsetData,
				prepareMenageContainerData,
				prepareObjectTagsData('schemaTags'),
			)({ collection: schema, data: {} });

			return preparedData.data;
		},

		hydrateForDeleteSchema(containerData) {
			const containerName = getName(containerData.isCaseSensitive, getDbName(containerData));
			const databaseName = getName(containerData.isCaseSensitive, containerData.database);
			const name = getFullName(databaseName, containerName);

			return { name };
		},

		/**
		 * @param {{ name: string }}
		 * @returns {string}
		 */
		dropSchema({ name }) {
			return assignTemplates(templates.dropSchema, {
				name,
			});
		},

		/**
		 * @param {{ tag: Tag, schemaName: string, isCaseSensitive: boolean }}
		 * @returns {string}
		 */
		createTag({ tag, schemaName, isCaseSensitive }) {
			return assignTemplates(templates.createTag, {
				orReplace: getOrReplaceStatement(tag.orReplace),
				ifNotExist: getIfNotExistStatement(tag.ifNotExist),
				allowedValues: getTagAllowedValues({ allowedValues: tag.allowedValues }),
				name: getFullName(schemaName, getName(isCaseSensitive, tag.name)),
				comment: getCommentsStatement(tag.description),
			});
		},

		/**
		 * @param {{ tag: Tag, schemaName: string, isCaseSensitive: boolean }}
		 * @returns {string}
		 */
		dropTag({ tag, schemaName, isCaseSensitive }) {
			return assignTemplates(templates.dropTag, {
				name: getFullName(schemaName, getName(isCaseSensitive, tag.name)),
			});
		},

		/**
		 * @param {{tag: Tag, oldTag: Tag, schemaName: string, isCaseSensitive: boolean }}
		 * @returns {string}
		 */
		alterTag({ tag, oldTag, schemaName, isCaseSensitive }) {
			const oldName = getFullName(schemaName, getName(isCaseSensitive, oldTag.name));
			const newName = getFullName(schemaName, getName(isCaseSensitive, tag.name));
			const flattenAllowedValues = _.flatMap(tag.allowedValues, ({ value }) => value).filter(Boolean);
			const flattenOldAllowedValues = _.flatMap(oldTag.allowedValues, ({ value }) => value).filter(Boolean);
			const newAllowedValues = _.differenceBy(tag.allowedValues, oldTag.allowedValues, ({ value }) => value);
			const droppedAllowedValues = _.differenceBy(oldTag.allowedValues, tag.allowedValues, ({ value }) => value);

			const isNameChanged = oldName !== newName;
			const isCommentDropped = oldTag.description && !tag.description;
			const isCommentChanged = !isCommentDropped && tag.description !== oldTag.description;
			const isAllowedValuesDropped = flattenOldAllowedValues.length && !flattenAllowedValues.length;

			const statements = [];

			const createAndPushStatement = (condition, options) => {
				if (condition) {
					const statement = assignTemplates(templates.alterTag, options);
					statements.push(statement);
				}
			};

			createAndPushStatement(isNameChanged, {
				ifExists: ' IF EXISTS',
				name: oldName,
				option: 'RENAME TO ',
				optionValue: getName(isCaseSensitive, tag.name),
			});

			createAndPushStatement(isAllowedValuesDropped, {
				name: newName,
				option: 'UNSET ALLOWED_VALUES',
			});

			createAndPushStatement(!isAllowedValuesDropped && !_.isEmpty(droppedAllowedValues), {
				ifExists: ' IF EXISTS',
				name: newName,
				option: 'DROP',
				optionValue: getTagAllowedValues({ allowedValues: droppedAllowedValues }),
			});

			createAndPushStatement(!_.isEmpty(newAllowedValues), {
				ifExists: ' IF EXISTS',
				name: newName,
				option: 'ADD',
				optionValue: getTagAllowedValues({ allowedValues: newAllowedValues }),
			});

			createAndPushStatement(isCommentDropped, {
				ifExists: ' IF EXISTS',
				name: newName,
				option: 'UNSET COMMENT',
			});

			createAndPushStatement(isCommentChanged, {
				ifExists: ' IF EXISTS',
				name: newName,
				option: 'SET COMMENT = ',
				optionValue: toString(tag.description),
			});

			return statements.join('');
		},
	};
};
