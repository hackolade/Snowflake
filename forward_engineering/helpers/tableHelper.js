module.exports = (_, toOptions) => {
	const tab = (text, tab = '\t') => {
		return text
			.split('\n')
			.map(line => tab + line)
			.join('\n');
	};

	const mergeKeys = keys => keys.map(key => `"${key.name}"`).join(', ');

	const getFileFormat = (fileFormat, formatTypeOptions, formatName = '') => {
		if (fileFormat !== 'custom') {
			const options = toOptions(formatTypeOptions);
			return '(\n' + tab(`TYPE=${fileFormat}${options && `\n${options}`}`) + '\n)';
		}
	
		return '(\n' + tab(`FORMAT_NAME='${formatName}'`) + '\n)';
	};


	const getCopyOptions = copyOptions => {
		if (_.isEmpty(copyOptions)) {
			return '';
		}

		return 'STAGE_COPY_OPTIONS = (\n' + tab(toOptions(copyOptions)) + '\n)';
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
	
	return {
		mergeKeys,
		getFileFormat,
		tab,
		getCopyOptions,
		getAtOrBefore,
	};

}

