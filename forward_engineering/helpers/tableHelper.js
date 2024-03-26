module.exports = (_, app) => {
	const { tab } = app.require('@hackolade/ddl-fe-utils').general;
	const { toOptions } = require('./general')(_, app);

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
		} else {
			return '';
		}
	};

	const mergeKeys = keys => keys.map(key => `"${key.name}"`).join(', ');

	return {
		getFileFormat,
		getCopyOptions,
		addOptions,
		getAtOrBefore,
		mergeKeys,
	};
};
