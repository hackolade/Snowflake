/*
 * Copyright © 2016-2023 by IntegrIT S.A. dba Hackolade.  All rights reserved.
 *
 * The copyright to the computer software herein is the property of IntegrIT S.A.
 * The software may be used and/or copied only with the written permission of
 * IntegrIT S.A. or in accordance with the terms and conditions stipulated in
 * the agreement/contract under which the software has been supplied.
 */

module.exports = (_, app) => {
	const { toNumber, toBoolean } = require('./general')(_, app);

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

	return {
		getStageCopyOptions
	}
}
