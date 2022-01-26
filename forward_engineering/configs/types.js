/*
 * Copyright © 2016-2022 by IntegrIT S.A. dba Hackolade.  All rights reserved.
 *
 * The copyright to the computer software herein is the property of IntegrIT S.A.
 * The software may be used and/or copied only with the written permission of
 * IntegrIT S.A. or in accordance with the terms and conditions stipulated in
 * the agreement/contract under which the software has been supplied.
 */

module.exports = {
	NUMBER: {
		capacity: 12,
		mode: 'decimal',
	},
	DECIMAL: {
		capacity: 12,
		mode: 'decimal',
	},
	NUMERIC: {
		capacity: 12,
		mode: 'decimal',
	},
	INT: {
		capacity: 4,
	},
	INTEGER: {
		capacity: 4,
	},
	BIGINT: {
		capacity: 8,
	},
	BYTEINT: {
		capacity: 1,
	},
	TINYINT: {
		capacity: 1,
	},
	SMALLINT: {
		capacity: 2,
	},
	REAL: {
		capacity: 4,
		mode: 'floating',
	},
	FLOAT: {
		capacity: 8,
		mode: 'floating',
	},
	FLOAT4: {
		capacity: 4,
		mode: 'floating',
	},
	FLOAT8: {
		capacity: 8,
		mode: 'floating',
	},
	DOUBLE: {
		capacity: 8,
		mode: 'floating',
	},
	'DOUBLE PRECISION': {
		capacity: 8,
		mode: 'floating',
	},
	VARCHAR: {
		mode: 'varying',
	},
	CHAR: {
		size: 1,
	},
	CHARACTER: {
		size: 1,
	},
	STRING: {
		mode: 'varying',
	},
	TEXT: {
		mode: 'text',
	},
	BINARY: {
		size: 8000,
		mode: 'binary',
	},
	VARBINARY: {
		size: 8000,
		mode: 'binary',
	},
	BOOLEAN: {
		mode: 'boolean',
	},
	DATE: {
		format: 'YYYY-MM-DD',
	},
	DATETIME: {
		format: 'YYYY-MM-DD hh:mm:ss.nn',
	},
	TIME: {
		format: 'hh:mm:ss',
	},
	TIMESTAMP: {
		format: 'YYYY-MM-DD hh:mm:ss',
	},
	TIMESTAMP_LTZ: {
		format: 'YYYY-MM-DD hh:mm:ss.nnnnnnZ',
	},
	TIMESTAMPLTZ: {
		format: 'YYYY-MM-DD hh:mm:ss.nnnnnnZ',
	},
	TIMESTAMP_NTZ: {
		format: 'YYYY-MM-DD hh:mm:ss.nnn',
	},
	TIMESTAMPNTZ: {
		format: 'YYYY-MM-DD hh:mm:ss.nnn',
	},
	'TIMESTAMP WITHOUT TIME ZONE': {
		format: 'YYYY-MM-DD hh:mm:ss.nnn',
	},
	TIMESTAMP_TZ: {
		format: 'YYYY-MM-DD hh:mm:ss',
	},
	TIMESTAMPTZ: {
		format: 'YYYY-MM-DD hh:mm:ss',
	},
	'TIMESTAMP WITH LOCAL TIME ZONE': {
		format: 'YYYY-MM-DD hh:mm:ss',
	},
	'TIMESTAMP WITH TIME ZONE': {
		format: 'YYYY-MM-DD hh:mm:ss',
	},
	VARIANT: {
		format: 'semi-structured',
	},
	OBJECT: {
		format: 'semi-structured',
		mode: 'object',
	},
	ARRAY: {
		format: 'semi-structured',
		mode: 'array',
	},
	GEOGRAPHY: {
		mode: 'geography',
	},
};
