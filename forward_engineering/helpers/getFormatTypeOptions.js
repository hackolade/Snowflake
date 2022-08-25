
module.exports = _ => {
	const { toString, toStringIfNotNone, toStringIfNotAuto, toNumber, toBoolean } = require('./general')(_);
	
	const getNullIf = nullIfOptions =>
		Array.isArray(nullIfOptions) ? nullIfOptions.filter(item => item && item['NULL_IF_item']) : [];
	
	const getFormatTypeOptions = (fileFormat, formatOptions = {}) => {
		switch (fileFormat) {
			case 'CSV':
				return {
					'COMPRESSION': formatOptions['COMPRESSION'],
					'RECORD_DELIMITER': toStringIfNotNone(formatOptions['RECORD_DELIMITER']),
					'FIELD_DELIMITER': toStringIfNotNone(formatOptions['FIELD_DELIMITER']),
					'FILE_EXTENSION': toStringIfNotNone(formatOptions['FILE_EXTENSION']),
					'SKIP_HEADER': toNumber(formatOptions['SKIP_HEADER']),
					'DATE_FORMAT': toStringIfNotAuto(formatOptions['DATE_FORMAT']),
					'TIME_FORMAT': toStringIfNotAuto(formatOptions['TIME_FORMAT']),
					'TIMESTAMP_FORMAT': toStringIfNotAuto(formatOptions['TIMESTAMP_FORMAT']),
					'BINARY_FORMAT': formatOptions['BINARY_FORMAT'],
					'ESCAPE': toStringIfNotNone(formatOptions['ESCAPE']),
					'ESCAPE_UNENCLOSED_FIELD': toStringIfNotNone(formatOptions['ESCAPE_UNENCLOSED_FIELD']),
					'TRIM_SPACE': toBoolean(formatOptions['TRIM_SPACE']),
					'FIELD_OPTIONALLY_ENCLOSED_BY': toStringIfNotNone(formatOptions['FIELD_OPTIONALLY_ENCLOSED_BY']),
					'NULL_IF': !_.isEmpty(getNullIf(formatOptions['NULL_IF']))
						? getNullIf(formatOptions['NULL_IF']).map(item => toString(item['NULL_IF_item']))
						: [],
					'ERROR_ON_COLUMN_COUNT_MISMATCH': toBoolean(formatOptions['ERROR_ON_COLUMN_COUNT_MISMATCH']),
					'VALIDATE_UTF8': toBoolean(formatOptions['VALIDATE_UTF8']),
					'EMPTY_FIELD_AS_NULL': toBoolean(formatOptions['EMPTY_FIELD_AS_NULL']),
					'SKIP_BYTE_ORDER_MARK': toBoolean(formatOptions['SKIP_BYTE_ORDER_MARK']),
					'ENCODING': toString(formatOptions['ENCODING']),
				};
			case 'JSON':
				return {
					'COMPRESSION': formatOptions['COMPRESSION'],
					'FILE_EXTENSION': toStringIfNotNone(formatOptions['FILE_EXTENSION']),
					'ENABLE_OCTAL': toBoolean(formatOptions['ENABLE_OCTAL']),
					'ALLOW_DUPLICATE': toBoolean(formatOptions['ALLOW_DUPLICATE']),
					'STRIP_OUTER_ARRAY': toBoolean(formatOptions['STRIP_OUTER_ARRAY']),
					'STRIP_NULL_VALUES': toBoolean(formatOptions['STRIP_NULL_VALUES']),
					'IGNORE_UTF8_ERRORS': toBoolean(formatOptions['IGNORE_UTF8_ERRORS']),
					'SKIP_BYTE_ORDER_MARK': toBoolean(formatOptions['SKIP_BYTE_ORDER_MARK']),
				};
	
			case 'AVRO':
				return {
					'COMPRESSION': formatOptions['COMPRESSION'],
				};
	
			case 'PARQUET':
				return {
					'COMPRESSION': formatOptions['SNAPPY_COMPRESSION'] ? undefined : formatOptions['COMPRESSION'],
					'SNAPPY_COMPRESSION': formatOptions['SNAPPY_COMPRESSION']
						? toBoolean(formatOptions['SNAPPY_COMPRESSION'])
						: undefined,
					'BINARY_AS_TEXT': toBoolean(formatOptions['BINARY_AS_TEXT']),
				};
	
			case 'XML':
				return {
					'COMPRESSION': formatOptions['COMPRESSION'],
					'IGNORE_UTF8_ERRORS': toBoolean(formatOptions['IGNORE_UTF8_ERRORS']),
					'PRESERVE_SPACE': toBoolean(formatOptions['PRESERVE_SPACE']),
					'STRIP_OUTER_ELEMENT': toBoolean(formatOptions['STRIP_OUTER_ELEMENT']),
					'DISABLE_SNOWFLAKE_DATA': toBoolean(formatOptions['DISABLE_SNOWFLAKE_DATA']),
					'DISABLE_AUTO_CONVERT': toBoolean(formatOptions['DISABLE_AUTO_CONVERT']),
					'SKIP_BYTE_ORDER_MARK': toBoolean(formatOptions['SKIP_BYTE_ORDER_MARK']),
				};
			default:
				return {};
		}
	};

	return getFormatTypeOptions;
}
