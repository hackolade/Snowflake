/*
 * Copyright © 2016-2023 by IntegrIT S.A. dba Hackolade.  All rights reserved.
 *
 * The copyright to the computer software herein is the property of IntegrIT S.A.
 * The software may be used and/or copied only with the written permission of
 * IntegrIT S.A. or in accordance with the terms and conditions stipulated in
 * the agreement/contract under which the software has been supplied.
 */

module.exports = (_, app) => {
	const templates = require('../configs/templates');
	const assignTemplates = app.require('@hackolade/ddl-fe-utils').assignTemplates;
	const { getFileFormat, getCopyOptions } = require('./tableHelper')(_, app);
	const { foreignKeysToString, getFullName } = require('./general')(_, app);
	const commentIfDeactivated = require('./commentDeactivatedHelper');

	const alterTableSetAction = tableData => {
		const stageFileFormat = tableData.fileFormat
			? 'STAGE_FILE_FORMAT=' + getFileFormat(tableData.fileFormat, tableData.formatTypeOptions)
			: '';
		const copyOptions = getCopyOptions(tableData.copyOptions);
		const dataRetentionTime = tableData.dataRetentionTime
			? `DATA_RETENTION_TIME_IN_DAYS=${tableData.dataRetentionTime}`
			: '';
		const comment = tableData.comment ? `COMMENT=$$${tableData.comment}$$` : '';

		return [stageFileFormat, copyOptions, dataRetentionTime, comment].filter(Boolean).map(statement => {
			return { statement: `SET ${statement}` };
		});
	};
	const alterTableClusterAction = tableData =>
		!_.isEmpty(tableData.clusteringKey)
			? 'CLUSTER BY (' + foreignKeysToString(tableData.isCaseSensitive, tableData.clusteringKey) + ')'
			: '';

	const alterTableColumnAction = tableData =>
		tableData.columns.map(column => {
			return {
				statement: `ADD COLUMN ${column.statement}`,
				isActivated: _.get(column, 'isActivated', true),
			};
		});

	const alterTableConstraintAction = constraints =>
		!_.isEmpty(constraints)
			? constraints.map(constraint => {
				return { statement: `ADD ${constraint.statement}`, isActivated: constraint.isActivated };
			})
			: '';

	return common => ({
		...common,

		createSchema({ schemaName, databaseName, managedAccess, dataRetention, comment }) {
			return (
				[
					databaseName ? `USE DATABASE ${databaseName};` : '',
					`USE SCHEMA ${schemaName};\n`,
					!isNaN(dataRetention) && dataRetention
						? assignTemplates(templates.alterSchema, {
							name: schemaName,
							operation: 'SET',
							options: 'DATA_RETENTION_TIME_IN_DAYS=' + dataRetention,
						})
						: '',
					comment
						? assignTemplates(templates.alterSchema, {
							name: schemaName,
							operation: 'SET',
							options: `COMMENT=$$${comment}$$`,
						})
						: '',
					assignTemplates(templates.alterSchema, {
						name: schemaName,
						operation: managedAccess ? 'ENABLE' : 'DISABLE',
						options: 'MANAGED ACCESS',
					}),
				]
					.filter(Boolean)
					.join('\n') + '\n'
			);
		},

		createTable(tableData) {
			const schemaName = _.get(tableData, 'schemaData.schemaName');
			return (
				[
					...alterTableSetAction(tableData),
					...alterTableColumnAction(tableData),
					alterTableClusterAction(tableData),
					...alterTableConstraintAction(
						[].concat(tableData.foreignKeyConstraints || []).concat(tableData.compositePrimaryKeys),
					),
				]
					.filter(Boolean)
					.map(action =>
						commentIfDeactivated(
							assignTemplates(templates.alterTable, {
								name: getFullName(schemaName, tableData.name),
								action: action.statement || action,
							}),
							action,
						),
					)
					.join('\n') + '\n'
			);
		},

		createView(viewData) {
			const schemaName = _.get(viewData, 'schemaData.schemaName');
			const secure = viewData.secure ? 'SET SECURE' : 'UNSET SECURE';
			const comment = viewData.comment ? `SET COMMENT=$$${viewData.comment}$$` : 'UNSET COMMENT';

			return (
				[secure, comment]
					.filter(Boolean)
					.map(action =>
						assignTemplates(templates.alterView, {
							name: getFullName(schemaName, viewData.name),
							materialized: viewData.materialized ? ' MATERIALIZED' : '',
							action: action,
						}),
					)
					.join('\n') + '\n'
			);
		},
	});
};
