const COPY_OPTIONS_DEFAULT = {
	ON_ERROR: 'ABORT_STATEMENT',
	SIZE_LIMIT: null,
	PURGE: true,
	RETURN_FAILED_ONLY: false,
	MATCH_BY_COLUMN_NAME: 'none',
	ENFORCE_LENGTH: true,
	TRUNCATECOLUMNS: false,
	FORCE: false,
}

const getDiffCopyOptionsByDefault = _ => (oldOptions = {}, newOptions = {}, commonKeys = []) => {
	return commonKeys.reduce((acc, key) => {
		if (_.isEqual(oldOptions[key], newOptions[key])) {
			return acc;
		}

		if (!newOptions[key] && oldOptions[key] !== COPY_OPTIONS_DEFAULT[key]) {
			return {
				...acc,
				[key]: COPY_OPTIONS_DEFAULT[key],
			};
		}

		if (newOptions[key]) {
			return {
				...acc,
				[key]: newOptions[key],
			};
		}

		return acc;
	}, {});
};

module.exports = {
	getDiffCopyOptionsByDefault,
}