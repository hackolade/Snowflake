const templates = require('./configs/templates');
const assignTemplates = require('./utils/assignTemplates');

module.exports = (_) => {
	const getStageCopyOptions = require('./helpers/getStageCopyOptions')(_);

	const {
		clean,
		getName,
		composeClusteringKey,
		toBoolean,
		toString,
		foreignKeysToString,
		foreignActiveKeysToString,
		addOptions,
		getFullName,
		getDbName,
		toOptions,
		viewColumnsToString
	} = require('./helpers/general')(_);

	const keyHelper = require('./helpers/keyHelper')(_, clean);

	const { mergeKeys, tab, getFileFormat, getCopyOptions, getAtOrBefore } =
		require('./helpers/tableHelper')(_, toOptions);

	const getFormatTypeOptions = require('./helpers/getFormatTypeOptions')(_);

	const generateConstraint = require('./helpers/constraintHelper')(_);

	const { commentIfDeactivated } = require('./helpers/commentDeactivatedHelper')(_);

	const {
		decorateType,
		getDefault,
		getAutoIncrement,
		getCollation,
		getInlineConstraint,
		createExternalColumn,
	} = require('./helpers/columnDefinitionHelper')(_);

	const {
		prepareAlterSetUnsetData,
		prepareContainerName,
		prepareMenageContainerData,
		prepareName,
		prepareTableName,
		prepareCollectionFileFormat,
		prepareCollectionFormatTypeOptions,
		prepareCollectionStageCopyOptions,
	} = require('./helpers/alterScriptHelpers/common')

	const {
		getAlterSchemaName,
		getSetCollectionProperty,
		getUnsetCollectionProperty,
		getSchemaMenageAccess,
		getAlterSchemaScript,
		getAlterEntityScript,
		getAlterTableFormat,
		getAlterEntityRename,
		getAlterTableStageCopyOptions
	} = require('./helpers/alterScriptHelpers/commonScript')({ getName, getFullName, templates, assignTemplates, tab, _ });

	const getOutOfLineConstraints = (
		foreignKeyConstraints,
		primaryKeyConstraints,
		uniqueKeyConstraints,
		isParentActivated
	) => {
		const constraints = []
			.concat(foreignKeyConstraints || [])
			.concat(primaryKeyConstraints)
			.concat(uniqueKeyConstraints)
			.map(constraint =>
				isParentActivated
					? commentIfDeactivated(constraint.statement, constraint)
					: constraint.statement
			);

		return !_.isEmpty(constraints)
			? ',\n\t\t' + constraints.join(',\n\t\t')
			: '';
	};

	return {
		convertColumnDefinition(columnDefinition) {
			const columnStatement = assignTemplates(templates.columnDefinition, {
				name: columnDefinition.name,
				type: decorateType(columnDefinition.type, columnDefinition),
				collation: getCollation(
					columnDefinition.type,
					columnDefinition.collation
				),
				default: !_.isUndefined(columnDefinition.default)
					? ' DEFAULT ' +
						getDefault(columnDefinition.type, columnDefinition.default)
					: '',
				autoincrement: getAutoIncrement(
					columnDefinition.type,
					columnDefinition.autoincrement
				),
				not_nul: !columnDefinition.nullable ? ' NOT NULL' : '',
				inline_constraint: getInlineConstraint(columnDefinition),
				comment: columnDefinition.comment
					? ` COMMENT $$${columnDefinition.comment}$$`
					: '',
			});
			return {
				statement: columnStatement,
				isActivated: columnDefinition.isActivated,
			};
		},

		createSchema({
			schemaName,
			databaseName,
			transient,
			managedAccess,
			dataRetention,
			comment,
			udfs,
			sequences,
			fileFormats,
			stages,
			isCaseSensitive,
		}) {
			const transientStatement = transient ? ' TRANSIENT' : '';
			const dataRetentionStatement =
				!isNaN(dataRetention) && dataRetention ? `\n\tDATA_RETENTION_TIME_IN_DAYS=${dataRetention}` : '';
			const managedAccessStatement = managedAccess ? '\n\tWITH MANAGED ACCESS' : '';
			const commentStatement = comment ? `\n\tCOMMENT=$$${comment}$$` : '';
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
			const userDefinedFunctions = udfs.map(udf =>
				assignTemplates(templates.createUDF, {
					name: getFullName(currentSchemaName, getName(isCaseSensitive, udf.name)),
					arguments: (udf.arguments || '').replace(/^\(([\s\S]+)\)$/, '$1'),
					return_type: udf.return_type,
					language: udf.language,
					function: udf.function,
					comment: udf.comment,
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
	
			const statements = [];
	
			statements.push(schemaStatement);
	
			return [...statements, ...userDefinedFunctions, ...sequencesStatements, ...fileFormatsStatements, ...stagesStatements,].join('\n');
		},

		hydrateSchema(containerData, { udfs, sequences, fileFormats, stages } = {}) {
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
									language: udf.functionLanguage || udf.storedProcLanguage || undefined,
									arguments: udf.functionArguments || udf.storedProcArgument || undefined,
									return_type: udf.functionReturnType || udf.storedProcDataType || undefined,
									function:
										udf.functionBody || udf.storedProcFunction
											? tab(_.trim(udf.functionBody || udf.storedProcFunction))
											: undefined,
									comment:
										udf.functionDescription || udf.storedProcDescription
											? ` COMMENT=$$${udf.functionDescription || udf.storedProcDescription}$$`
											: '',
								}),
							)
							.filter(udf => udf.name && udf.language && udf.return_type && udf.function)
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

		hydrateColumn({ columnDefinition, jsonSchema }) {
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

		hydrateTable({ tableData, entityData, jsonSchema }) {
			const keyConstraints = keyHelper.getTableKeyConstraints({ jsonSchema });
			const firstTab = _.get(entityData, '[0]', {});
			const schemaName = getName(firstTab.isCaseSensitive, _.get(tableData, 'schemaData.schemaName'));
			const databaseName = getName(firstTab.isCaseSensitive, _.get(tableData, 'schemaData.databaseName'));
			const tableName = getName(firstTab.isCaseSensitive, tableData.name);
			const fullName = getFullName(databaseName, getFullName(schemaName, tableName));
			const getLocation = location => {
				return location.namespace
					? location.namespace + location.path
					: location.path;
			};
			const fileFormat = firstTab.external
				? firstTab.externalFileFormat
				: firstTab.fileFormat;
			
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
						[column.primaryKeyConstraintName]: Array.isArray(
							result[column.primaryKeyConstraintName]
						)
							? _.uniqBy(
									[
										...result[column.primaryKeyConstraintName],
										{ name: column.name, isActivated: column.isActivated },
									],
									'name'
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
						[column.uniqueKeyConstraintName]: Array.isArray(
							result[column.uniqueKeyConstraintName]
						)
							? _.uniqBy(
									[
										...result[column.uniqueKeyConstraintName],
										{ name: column.name, isActivated: column.isActivated },
									],
									'name'
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
				selectStatement: firstTab.selectStatement,
				isCaseSensitive: firstTab.isCaseSensitive,
				clusteringKey: Array.isArray(firstTab.clusteringKey)
					? firstTab.clusteringKey
							.map(key =>
								composeClusteringKey(firstTab.isCaseSensitive, jsonSchema, key)
							)
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
					_.get(tableData, `relatedSchemas[${firstTab.clone}].code`, '')
				),
				likeTableName: getName(
					firstTab.isCaseSensitive,
					_.get(tableData, `relatedSchemas[${firstTab.like}].code`, '')
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
					location: _.isPlainObject(firstTab.location)
						? getLocation(firstTab.location)
						: '',
					REFRESH_ON_CREATE: toBoolean(firstTab.REFRESH_ON_CREATE),
					AUTO_REFRESH: toBoolean(firstTab.AUTO_REFRESH),
					PATTERN: firstTab.PATTERN ? toString(firstTab.PATTERN) : '',
				},
				columns: firstTab.external
					? tableData.columnDefinitions.map(createExternalColumn)
					: tableData.columns,
				compositePrimaryKeys: Object.entries(compositePrimaryKeys).map(
					([name, keys]) =>
						generateConstraint({
							name,
							keys,
							keyType: 'PRIMARY KEY',
							isActivated: jsonSchema.isActivated,
							isCaseSensitive: firstTab.isCaseSensitive,
						})
				),
				compositeUniqueKeys: Object.entries(compositeUniqueKeys).map(
					([name, keys]) =>
						generateConstraint({
							name,
							keys,
							keyType: 'UNIQUE',
							isActivated: jsonSchema.isActivated,
							isCaseSensitive: firstTab.isCaseSensitive,
						})
				),
			};
		},

		createTable(tableData, isActivated) {
			const schemaName = _.get(tableData, 'schemaData.schemaName');
			const temporary = tableData.temporary ? ' TEMPORARY' : '';
			const transient =
				tableData.transient && !tableData.temporary ? ' TRANSIENT' : '';
			const clusterKeys = !_.isEmpty(tableData.clusteringKey)
				? ' CLUSTER BY (' +
					(isActivated
						? foreignKeysToString(
								tableData.isCaseSensitive,
								tableData.clusteringKey
							)
						: foreignActiveKeysToString(
								tableData.isCaseSensitive,
								tableData.clusteringKey
							)) +
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
								}))
							)
						: mergeKeys(tableData.partitioningKey)) +
					')'
				: '';
			const comment = tableData.comment
				? ` COMMENT=$$${tableData.comment}$$`
				: '';
			const copyGrants = tableData.copyGrants ? ` COPY GRANTS` : '';
			const dataRetentionTime = tableData.dataRetentionTime
				? ` DATA_RETENTION_TIME_IN_DAYS=${tableData.dataRetentionTime}`
				: '';
			const stageFileFormat = tableData.fileFormat
				? tab(
						'STAGE_FILE_FORMAT = ' +
							getFileFormat(
								tableData.fileFormat,
								tableData.formatTypeOptions,
								tableData.formatName
							),
						' '
					)
				: '';
			const fileFormat = tableData.fileFormat
				? tab(
						'FILE_FORMAT = ' +
							getFileFormat(
								tableData.fileFormat,
								tableData.formatTypeOptions,
								tableData.formatName
							),
						' '
					)
				: '';
			const copyOptions = tab(getCopyOptions(tableData.copyOptions), ' ');
			const atOrBefore = tab(getAtOrBefore(tableData.cloneParams), ' ');
			const columnDefinitions = tableData.columns
				.map(column => commentIfDeactivated(column.statement, column))
				.join(',\n\t\t');

			if (tableData.selectStatement) {
				return assignTemplates(templates.createAsSelect, {
					name: tableData.fullName,
					selectStatement: tableData.selectStatement,
					tableOptions: addOptions([clusterKeys, copyGrants]),
				});
			} else if (tableData.cloneTableName) {
				return assignTemplates(templates.createCloneTable, {
					name: tableData.fullName,
					source_table: getFullName(schemaName, tableData.cloneTableName),
					tableOptions: addOptions([atOrBefore, copyGrants]),
				});
			} else if (tableData.likeTableName) {
				return assignTemplates(templates.createLikeTable, {
					name: tableData.fullName,
					source_table: getFullName(schemaName, tableData.likeTableName),
					tableOptions: addOptions([clusterKeys, copyGrants]),
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
						],
						comment
					),

					column_definitions: columnDefinitions,
					out_of_line_constraints: getOutOfLineConstraints(
						tableData.foreignKeyConstraints,
						tableData.compositePrimaryKeys,
						tableData.compositeUniqueKeys,
						isActivated
					),
				});
			} else {
				return assignTemplates(templates.createTable, {
					name: tableData.fullName,
					temporary: temporary,
					transient: transient,
					tableOptions: addOptions(
						[
							clusterKeys,
							stageFileFormat,
							copyOptions,
							dataRetentionTime,
							copyGrants,
						],
						comment
					),

					column_definitions: columnDefinitions,
					out_of_line_constraints: getOutOfLineConstraints(
						tableData.foreignKeyConstraints,
						tableData.compositePrimaryKeys,
						tableData.compositeUniqueKeys,
						isActivated
					),
				});
			}
		},

		hydrateView({ viewData, entityData }) {
			const firstTab = entityData[0];
			const { databaseName, schemaName } = viewData.schemaData;
			const viewName = getName(firstTab.isCaseSensitive, viewData.name);
			const fullName = getFullName(databaseName, getFullName(schemaName, viewName));

			return {
				...viewData,
				selectStatement: firstTab.selectStatement,
				isCaseSensitive: firstTab.isCaseSensitive,
				copyGrants: firstTab.copyGrants,
				comment: firstTab.description,
				secure: firstTab.secure,
				materialized: firstTab.materialized,
				fullName,
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

		createView(viewData, dbData, isActivated) {
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
				`SELECT \n\t${viewColumnsToString(tableColumns, isActivated)}\nFROM ${tables.join(' INNER JOIN ')};\n`;
	
			return assignTemplates(templates.createView, {
				secure: viewData.secure ? ' SECURE' : '',
				materialized: viewData.materialized ? ' MATERIALIZED' : '',
				name: viewData.fullName,
				column_list: viewColumnsToString(columnList, isActivated),
				copy_grants: viewData.copyGrants ? 'COPY GRANTS\n' : '',
				comment: viewData.comment ? 'COMMENT=$$' + viewData.comment + '$$\n' : '',
				select_statement: selectStatement,
			});
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

		hydrateAlertTable(collection) {
			const { data } = _.flow(
				prepareName,
				prepareTableName,
				prepareCollectionFileFormat,
				prepareCollectionFormatTypeOptions(_),
				prepareAlterSetUnsetData,
				prepareCollectionStageCopyOptions(clean, getStageCopyOptions, _),
			)({ collection, data: {} });

			const formatTypeOptions = clean(getFormatTypeOptions(data.formatData.fileFormat, data.formatTypeOptions.typeOptions))

			return {
				...data,
				formatTypeOptions: {
					...data.formatTypeOptions,
					typeOptions: formatTypeOptions
				}
			};
		},

		alterTable(data) {
			const alterTableScript = getAlterEntityScript(templates.alterTableScript, data.nameData);
			const { script } = _.flow(
				getAlterEntityRename(templates.alterTableScript, templates.alterEntityRename),
				getSetCollectionProperty(alterTableScript),
				getUnsetCollectionProperty(alterTableScript),
				getAlterTableFormat(alterTableScript, getFileFormat),
				getAlterTableStageCopyOptions(alterTableScript, getCopyOptions, _),
			)({ data, script: [] });
			
			return script.join('\n');
		},

		hydrateAlterView(collection) {
			const { data } = _.flow(
				prepareName,
				prepareTableName,
				prepareAlterSetUnsetData,
			)({ collection, data: {} });

			return data;
		},

		alterView(data) {
			const { nameData } = data;
			const alterTableTemplateName = nameData.isMaterialized ? 'alterMaterializedViewScript' : 'alterViewScript';
			const alterTableScript = getAlterEntityScript(templates[alterTableTemplateName], nameData);
			const { script } = _.flow(
				getAlterEntityRename(templates[alterTableTemplateName], templates.alterEntityRename),
				getSetCollectionProperty(alterTableScript),
				getUnsetCollectionProperty(alterTableScript),
			)({ data, script: [] });
			
			return script.join('\n');
		},
	};
};
