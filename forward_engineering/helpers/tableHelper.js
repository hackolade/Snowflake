const _ = require('lodash');

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
		if (_.isEmpty(copyOptions)) {
			return '';
		}

		return 'STAGE_COPY_OPTIONS = (\n' + tab(toOptions(copyOptions)) + '\n)';
	};

	const addOptions = (options, comment) => {
		const allOptions = _.trim(
			tab(options.filter(statement => Boolean(_.trim(statement, '\t\n '))).join('\n')),
			'\t\n',
		);

		if (_.trim(comment)) {
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

		return `TARGET_LAG = ${targetLagDownstream ? 'DOWNSTREAM' : `'${targetLagAmount} ${targetLagTimeSpan}'`}\n`;
	}

	function getSelectStatement(selectStatement) {
		const mapStatement = (statement, index, statements) =>
			index === statements.length - 1 ? `\t${statement}` : `\t${statement}\n`;

		return `AS\n${selectStatement.split('\n').map(mapStatement).join('')}`;
	}

	const getDynamicTableProps = ({
		iceberg,
		tableData,
		transient,
		tagsStatement,
		clusterKeys,
		comment,
		dataRetentionTime,
		copyGrants,
		columnDefinitions,
	}) => {
		if (!tableData.dynamicTableProps) {
			return {};
		}

		const { selectStatement } = tableData;
		const {
			targetLag,
			warehouse,
			refreshMode,
			initialize,
			maxDataExtensionTime,
			externalVolume,
			catalog,
			baseLocation,
		} = tableData.dynamicTableProps;

		return {
			targetLag: getTargetLag(targetLag),
			iceberg: iceberg ? ' ICEBERG' : '',
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
		};
	};

	return {
		getFileFormat,
		getCopyOptions,
		addOptions,
		getAtOrBefore,
		mergeKeys,
		getDynamicTableProps,
	};
};
