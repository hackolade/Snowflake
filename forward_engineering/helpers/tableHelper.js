const { isEmpty, toUpper, trim } = require('lodash');
const { preSpace } = require('../utils/preSpace');

module.exports = app => {
	const { tab } = app.require('@hackolade/ddl-fe-utils').general;
	const { toOptions } = require('./general')(app);

	const getFileFormat = (fileFormat, formatTypeOptions, formatName = '') => {
		if (fileFormat !== 'custom') {
			return '(\n' + tab(`TYPE=${fileFormat}\n${toOptions(formatTypeOptions)}`) + '\n)';
		}

		return '(\n' + tab(`FORMAT_NAME='${formatName}'`) + '\n)';
	};

	const getCopyOptions = copyOptions => {
		if (isEmpty(copyOptions)) {
			return '';
		}

		return 'STAGE_COPY_OPTIONS = (\n' + tab(toOptions(copyOptions)) + '\n)';
	};

	const addOptions = (options, comment) => {
		const allOptions = trim(tab(options.filter(statement => Boolean(trim(statement, '\t\n '))).join('\n')), '\t\n');

		if (trim(comment)) {
			return allOptions + '\n\t' + comment;
		}

		return allOptions;
	};

	const getAtOrBefore = cloneParams => {
		if (cloneParams.TIMESTAMP) {
			return `${cloneParams.atOrBefore} (timestamp => ${cloneParams.TIMESTAMP})`;
		} else if (cloneParams.OFFSET) {
			return `${cloneParams.atOrBefore} (offset => ${cloneParams.OFFSET})`;
		} else if (cloneParams.STATEMENT) {
			return `${cloneParams.atOrBefore} (statement => '${cloneParams.STATEMENT}')`;
		}

		return '';
	};

	const mergeKeys = keys => keys.map(key => `"${key.name}"`).join(', ');

	function getTargetLag({ targetLagTimeSpan, targetLagAmount, targetLagDownstream }) {
		if (!(targetLagTimeSpan && targetLagAmount) && !targetLagDownstream) {
			return '';
		}

		const targetLagValue = targetLagDownstream ? 'DOWNSTREAM' : `'${targetLagAmount} ${targetLagTimeSpan}'`;

		return `TARGET_LAG = ${targetLagValue}\n`;
	}

	function getSelectStatement(selectStatement) {
		const mapStatement = (statement, index, statements) =>
			index === statements.length - 1 ? `\t${statement}` : `\t${statement}\n`;

		return `AS\n${selectStatement.split('\n').map(mapStatement).join('')}`;
	}

	const getTableExtraProps = ({
		tableData,
		tagsStatement,
		clusterKeys,
		comment,
		dataRetentionTime,
		copyGrants,
		columnDefinitions,
	}) => {
		if (!tableData.tableExtraProps) {
			return {};
		}

		const {
			iceberg,
			dynamic,
			transient,
			selectStatement,
			tableExtraProps: {
				targetLag,
				warehouse,
				refreshMode,
				initialize,
				maxDataExtensionTime,
				externalVolume,
				catalog,
				baseLocation,
				catalogSync,
				storageSerializationPolicy,
				changeTracking,
				defaultDdlCollation,
				catalogTableName,
				catalogNamespace,
				metadataFilePath,
				replaceInvalidCharacters,
				autoRefresh,
			},
		} = tableData;

		return {
			targetLag: getTargetLag(targetLag),
			warehouse: warehouse ? `WAREHOUSE = ${warehouse}\n` : '',
			selectStatement: selectStatement ? getSelectStatement(selectStatement) : '',
			externalVolume: externalVolume ? `EXTERNAL_VOLUME = '${externalVolume}'\n` : '',
			catalog: catalog ? `CATALOG = '${catalog}'\n` : '',
			baseLocation: baseLocation ? `BASE_LOCATION = '${baseLocation}'\n` : '',
			column_definitions: columnDefinitions ? `\t(\n\t\t${columnDefinitions}\n\t)\n` : '',
			refreshMode: refreshMode ? `REFRESH_MODE = ${refreshMode}\n` : '',
			initialize: initialize ? `INITIALIZE = ${initialize}\n` : '',
			clusterKeys,
			dataRetentionTime: dataRetentionTime ? `${dataRetentionTime.trim()}\n` : '',
			maxDataExtensionTime: maxDataExtensionTime
				? `MAX_DATA_EXTENSION_TIME_IN_DAYS = ${maxDataExtensionTime}\n`
				: '',
			copyGrants: copyGrants ? `${copyGrants.trim()}\n` : '',
			comment: comment ? `${comment.trim()}\n` : '',
			tagsStatement: tagsStatement ? `${tagsStatement.trim()}\n` : '',
			transient: preSpace(transient && 'TRANSIENT'),
			iceberg: preSpace(iceberg && 'ICEBERG'),
			dynamic: preSpace(dynamic && 'DYNAMIC'),
			catalogSync: catalogSync ? `CATALOG_SYNC = '${catalogSync}'\n` : '',
			storageSerializationPolicy: storageSerializationPolicy
				? `STORAGE_SERIALIZATION_POLICY = ${toUpper(storageSerializationPolicy)}\n`
				: '',
			changeTracking: changeTracking ? 'CHANGE_TRACKING = TRUE\n' : '',
			defaultDdlCollation: defaultDdlCollation ? `DEFAULT_DDL_COLLATION = '${defaultDdlCollation}'\n` : '',
			catalogTableName: catalogTableName ? `CATALOG_TABLE_NAME = '${catalogTableName}'\n` : '',
			catalogNamespace: catalogNamespace ? `CATALOG_NAMESPACE = '${catalogNamespace}'\n` : '',
			metadataFilePath: metadataFilePath ? `METADATA_FILE_PATH = '${metadataFilePath}'\n` : '',
			replaceInvalidCharacters: replaceInvalidCharacters ? 'REPLACE_INVALID_CHARACTERS = TRUE\n' : '',
			autoRefresh: autoRefresh ? 'AUTO_REFRESH = TRUE\n' : '',
		};
	};

	return {
		getFileFormat,
		getCopyOptions,
		addOptions,
		getAtOrBefore,
		mergeKeys,
		getTableExtraProps,
	};
};
