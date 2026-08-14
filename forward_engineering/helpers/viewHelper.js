const { isEmpty, head } = require('lodash');
const { preSpace } = require('../utils/preSpace');
const { getName, getFullName, viewColumnsToString } = require('./general');
const { escapeString } = require('../utils/escapeString');
const { getTagStatement } = require('./tagHelper');
const assignTemplates = require('../utils/assignTemplates');
const templates = require('../configs/templates');

const createView = ({ viewData, isActivated, scriptFormat, getViewSelectStatement, keyHelper }) => {
	const orReplace = preSpace(viewData.orReplace && 'OR REPLACE');
	const ifNotExist = preSpace(viewData.ifNotExist && 'IF NOT EXISTS');
	const { columnList, tableColumns, tables } = viewData.keys.reduce(
		(result, key) => {
			// Keys without an entityName are plain columns that don't reference any table/view column.
			// They exist for documentation purposes only and can't take part in the SELECT statement.
			if (!key.entityName) {
				return result;
			}

			result.columnList.push({
				name: `${getName(viewData.isCaseSensitive, key.alias || key.name)}`,
				isActivated: key.isActivated,
				comment: preSpace(
					key.definition?.description && `COMMENT ${escapeString(scriptFormat, key.definition.description)}`,
				),
			});
			result.tableColumns.push({
				name: `${getName(viewData.isCaseSensitive, key.entityName)}.${getName(viewData.isCaseSensitive, key.name)}`,
				isActivated: key.isActivated,
			});

			const tableName = getFullName(key.dbName, key.entityName);

			if (!result.tables.includes(tableName)) {
				result.tables.push(tableName);
			}

			return result;
		},
		{
			columnList: [],
			tableColumns: [],
			tables: [],
		},
	);

	if (isEmpty(tables) && !viewData.selectStatement) {
		return '';
	}

	const viewColumns = viewColumnsToString(tableColumns, isActivated);
	const selectStatement = getViewSelectStatement({
		tables,
		viewData,
		viewColumns,
	});

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
		orReplace,
		ifNotExist,
		secure: preSpace(viewData.secure && 'SECURE'),
		materialized: preSpace(viewData.materialized && 'MATERIALIZED'),
		name: viewData.fullName,
		column_list: viewColumnsToString(columnList, isActivated),
		copy_grants: viewData.copyGrants ? 'COPY GRANTS\n' : '',
		comment: viewData.comment ? `COMMENT=${escapeString(scriptFormat, viewData.comment)}\n` : '',
		select_statement: selectStatement,
		tag: tagStatement ? tagStatement + '\n' : '',
		clustering,
	});
};

const hydrateView = ({ viewData, entityData }) => {
	const firstTab = entityData[0];
	const { databaseName, schemaName } = viewData.schemaData;
	const viewName = getName(firstTab.isCaseSensitive, viewData.name);
	const fullName = getFullName(getFullName(databaseName, schemaName), viewName);

	return {
		...viewData,
		orReplace: firstTab.orReplace,
		ifNotExist: firstTab.ifNotExist,
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
};

const hydrateViewColumn = data => {
	if (!data.entityName) {
		return data;
	}

	return {
		...data,
		name: getName(data.definition?.isCaseSensitive, data.name),
		dbName: getName(head(data.containerData)?.isCaseSensitive, data.dbName),
		entityName: getName(head(data.entityData)?.isCaseSensitive, data.entityName),
	};
};

module.exports = {
	createView,
	hydrateView,
	hydrateViewColumn,
};
