/*
 * Copyright © 2016-2023 by IntegrIT S.A. dba Hackolade.  All rights reserved.
 *
 * The copyright to the computer software herein is the property of IntegrIT S.A.
 * The software may be used and/or copied only with the written permission of
 * IntegrIT S.A. or in accordance with the terms and conditions stipulated in
 * the agreement/contract under which the software has been supplied.
 */

const templates = require('../configs/templates');

module.exports = (_, app) => {
	const { tab } = app.require('@hackolade/ddl-fe-utils').general;
	const assignTemplates = app.require('@hackolade/ddl-fe-utils').assignTemplates;
	const { getFileFormat, getCopyOptions, addOptions, getAtOrBefore, mergeKeys } = require('./tableHelper')(_, app);
	const {
		foreignKeysToString,
		viewColumnsToString,
		foreignActiveKeysToString,
		getName,
		getFullName,
	} = require('./general')(_, app);
	const { commentIfDeactivated } = require('./commentDeactivatedHelper')(_);

	const getOutOfLineConstraints = (
		foreignKeyConstraints,
		primaryKeyConstraints,
		uniqueKeyConstraints,
		isParentActivated,
	) => {
		const constraints = []
			.concat(foreignKeyConstraints || [])
			.concat(primaryKeyConstraints)
			.concat(uniqueKeyConstraints)
			.map(constraint =>
				isParentActivated ? commentIfDeactivated(constraint.statement, constraint) : constraint.statement,
			);

		return !_.isEmpty(constraints) ? ',\n\t\t' + constraints.join(',\n\t\t') : '';
	};

	return common => ({
		...common,

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
								 }) {
			const transientStatement = transient ? ' TRANSIENT' : '';
			const dataRetentionStatement =
				!isNaN(dataRetention) && dataRetention ? `\n\tDATA_RETENTION_TIME_IN_DAYS=${dataRetention}` : '';
			const managedAccessStatement = managedAccess ? '\n\tWITH MANAGED ACCESS' : '';
			const commentStatement = comment ? `\n\tCOMMENT=\n$$${comment}\t$$` : '';
			const currentSchemaName = getName(isCaseSensitive, schemaName);
			const schemaStatement = assignTemplates(templates.createSchema, {
				name: currentSchemaName,
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
			const proceduresStatements = procedures.map(
				({ name, orReplace, args, returnType, language, runtimeVersion, packages, handler, body, description }) => {
					const procedureBody = `\n\t$$\n${body}\n\t$$`;
					let parameters = '';
					const languagesWithoutParameters = ['sql', 'javascript'];
					if (!languagesWithoutParameters.includes(language)) {
						const languagesWithRuntimeVersionAsString = ['python'];
						const runtimeVersionToInsert = languagesWithRuntimeVersionAsString.includes(language)
							? `'${runtimeVersion}'`
							: runtimeVersion;
						const runtimeVersionStatement = runtimeVersion
							? `RUNTIME_VERSION = ${runtimeVersionToInsert}\n`
							: '';

						const handlerStatement = handler ? `\tHANDLER = '${handler}'\n` : '';
						const packagesStatement = packages
							? `\tPACKAGES = (${packages.map(({ packageName }) => `'${packageName}'`).join(', ')})\n`
							: '';

						parameters = `${runtimeVersionStatement}${handlerStatement}${packagesStatement}\t`;
					}

					const commentsStatement = description ? `COMMENT = '${description}'\n\t` : '';

					return assignTemplates(templates.createProcedure, {
						orReplace: orReplace ? ' OR REPLACE' : '',
						name: getFullName(currentSchemaName, getName(isCaseSensitive, name)),
						arguments: (args || '').replace(/^\(([\s\S]+)\)$/, '$1'),
						returnType: returnType,
						language: language,
						parameters,
						comment: commentsStatement,
						body: procedureBody,
					});
				},
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
			].join('\n');
		},

		createTable(tableData, isActivated) {
			const schemaName = _.get(tableData, 'schemaData.schemaName');
			const temporary = tableData.temporary ? ' TEMPORARY' : '';
			const transient = tableData.transient && !tableData.temporary ? ' TRANSIENT' : '';
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
			const comment = tableData.comment ? ` COMMENT=$$${tableData.comment}$$` : '';
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

			if (tableData.selectStatement) {
				return assignTemplates(templates.createAsSelect, {
					name: getFullName(schemaName, tableData.name),
					selectStatement: tableData.selectStatement,
					tableOptions: addOptions([clusterKeys, copyGrants]),
				});
			} else if (tableData.cloneTableName) {
				return assignTemplates(templates.createCloneTable, {
					name: getFullName(schemaName, tableData.name),
					source_table: getFullName(schemaName, tableData.cloneTableName),
					tableOptions: addOptions([atOrBefore, copyGrants]),
				});
			} else if (tableData.likeTableName) {
				return assignTemplates(templates.createLikeTable, {
					name: getFullName(schemaName, tableData.name),
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
				const pattern = tableData.externalOptions.PATTERN ? ' PATTERN=' + tableData.externalOptions.PATTERN : '';

				return assignTemplates(templates.createExternalTable, {
					name: getFullName(schemaName, tableData.name),
					tableOptions: addOptions(
						[partitionKeys, fileFormat, location, refreshOnCreate, autoRefresh, pattern, copyGrants],
						comment,
					),

					column_definitions: columnDefinitions,
					out_of_line_constraints: getOutOfLineConstraints(
						tableData.foreignKeyConstraints,
						tableData.compositePrimaryKeys,
						tableData.compositeUniqueKeys,
						isActivated,
					),
				});
			} else {
				return assignTemplates(templates.createTable, {
					name: getFullName(schemaName, tableData.name),
					temporary: temporary,
					transient: transient,
					tableOptions: addOptions(
						[clusterKeys, stageFileFormat, copyOptions, dataRetentionTime, copyGrants],
						comment,
					),

					column_definitions: columnDefinitions,
					out_of_line_constraints: getOutOfLineConstraints(
						tableData.foreignKeyConstraints,
						tableData.compositePrimaryKeys,
						tableData.compositeUniqueKeys,
						isActivated,
					),
				});
			}
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
				`SELECT \n\t${viewColumnsToString(tableColumns, isActivated)}\nFROM ${tables.join(' INNER JOIN ')};\n`;

			return assignTemplates(templates.createView, {
				secure: viewData.secure ? ' SECURE' : '',
				materialized: viewData.materialized ? ' MATERIALIZED' : '',
				name: getFullName(schemaName, viewData.name),
				column_list: viewColumnsToString(columnList, isActivated),
				copy_grants: viewData.copyGrants ? 'COPY GRANTS\n' : '',
				comment: viewData.comment ? 'COMMENT=$$' + viewData.comment + '$$\n' : '',
				select_statement: selectStatement,
			});
		},
	});
};
