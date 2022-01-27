
module.exports = _ => {
	const { toNumber, toBoolean } = require('./general')(_);

	const getOnError = properties => {
		if (properties.ON_ERROR === 'SKIP_FILE_<num>') {
			return `SKIP_FILE_${properties.skipFileNum}`;
		} else if (properties.ON_ERROR === 'SKIP_FILE_<num>%') {
			return `SKIP_FILE_${properties.skipFileNumPct}%`;
		} else {
			return properties.ON_ERROR;
		}
	};
	
	const getStageCopyOptions = properties => {
		return {
			ON_ERROR: getOnError(properties),
			SIZE_LIMIT: properties.sizeLimit ? toNumber(properties.SIZE_LIMIT) : undefined,
			PURGE: toBoolean(properties.PURGE),
			MATCH_BY_COLUMN_NAME: properties.MATCH_BY_COLUMN_NAME,
			ENFORCE_LENGTH: toBoolean(properties.ENFORCE_LENGTH),
			RETURN_FAILED_ONLY: toBoolean(properties.RETURN_FAILED_ONLY),
			TRUNCATECOLUMNS: toBoolean(properties.TRUNCATECOLUMNS),
			LOAD_UNCERTAIN_FILES: !properties.LOAD_UNCERTAIN_FILES ? undefined : toBoolean(properties.LOAD_UNCERTAIN_FILES),
			FORCE: toBoolean(properties.FORCE),
		};
	};
	return getStageCopyOptions;
}
