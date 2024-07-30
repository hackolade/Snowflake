const templates = require('../configs/templates');
const _ = require('lodash');
const { escapeString } = require('../utils/escapeString');

module.exports = app => {
	const assignTemplates = app.require('@hackolade/ddl-fe-utils').assignTemplates;

	const decorateType = (type, columnDefinition) => {
		type = _.toUpper(type);
		let resultType = type;

		if (isTimestamp(type)) {
			if (columnDefinition.timePrecision && !_.isNaN(columnDefinition.timePrecision)) {
				resultType = `${type}(${columnDefinition.timePrecision})`;
			}
		}

		if (['VARCHAR', 'STRING', 'TEXT', 'CHAR', 'CHARACTER'].includes(type)) {
			if (columnDefinition.length && !_.isNaN(columnDefinition.length)) {
				resultType = `${type}(${columnDefinition.length})`;
			}
		}

		if (['NUMBER', 'DECIMAL', 'NUMERIC'].includes(type)) {
			if (!_.isNaN(columnDefinition.scale) && !_.isNaN(columnDefinition.precision)) {
				resultType = `${type}(${Number(columnDefinition.precision)},${Number(columnDefinition.scale)})`;
			}
		}

		return resultType;
	};

	const isString = type => ['VARCHAR', 'STRING', 'TEXT', 'CHAR', 'CHARACTER'].includes(_.toUpper(type));
	const isNumber = type =>
		[
			'NUMBER',
			'DECIMAL',
			'NUMERIC',
			'INT',
			'INTEGER',
			'BIGINT',
			'BYTEINT',
			'TINYINT',
			'SMALLINT',
			'REAL',
			'FLOAT',
			'FLOAT4',
			'FLOAT8',
			'DOUBLE',
			'DOUBLE PRECISION',
		].includes(_.toUpper(type));
	const isTimestamp = type =>
		[
			'TIME',
			'TIMESTAMP_NTZ',
			'TIMESTAMP_TZ',
			'TIMESTAMP_LTZ',
			'TIMESTAMP',
			'TIMESTAMPNTZ',
			'TIMESTAMPTZ',
			'TIMESTAMPLTZ',
			'DATETIME',
		].includes(_.toUpper(type));

	const localEscapeString = str => str.replace(/^'([\S\s]+)'$/, '$1');

	const getDefault = ({ type, defaultValue, scriptFormat }) => {
		if (isString(type)) {
			return escapeString(scriptFormat, localEscapeString(String(defaultValue)));
		} else if (_.toUpper(type) === 'BOOLEAN') {
			return _.toUpper(defaultValue);
		}

		return defaultValue;
	};

	const getAutoIncrement = (type, keyword, autoIncrement) => {
		if (!autoIncrement) {
			return '';
		}

		if (!isNumber(type)) {
			return '';
		}
		let result = ` ${keyword}`;
		result +=
			!_.isNaN(autoIncrement.step) && (autoIncrement.start || autoIncrement.start === 0)
				? ' START ' + autoIncrement.start
				: '';
		result += !_.isNaN(autoIncrement.step) && autoIncrement.step ? ' INCREMENT ' + autoIncrement.step : '';

		return result;
	};

	const getCollation = (type, collation) => {
		if (!isString(type)) {
			return '';
		}

		if (_.isEmpty(collation)) {
			return '';
		}

		return (
			" COLLATE '" +
			Object.entries(collation)
				.map(([key, collationValue]) => {
					return collationValue;
				})
				.join('-') +
			"'"
		);
	};

	const getUnique = columnDefinition => {
		return columnDefinition.unique && !columnDefinition.compositeUniqueKey ? ' UNIQUE' : '';
	};

	const getPrimaryKey = columnDefinition => {
		if (!columnDefinition.primaryKey || columnDefinition.compositePrimaryKey) {
			return '';
		}

		return ' PRIMARY KEY';
	};

	const getInlineConstraint = columnDefinition => {
		return getPrimaryKey(columnDefinition) + getUnique(columnDefinition);
	};

	const createExternalColumn = columnDefinition => {
		const externalColumnStatement = assignTemplates(templates.externalColumnDefinition, {
			name: columnDefinition.name,
			type: decorateType(columnDefinition.type, columnDefinition),
			expression: columnDefinition.expression
				? `(${columnDefinition.expression})`
				: `(value:${columnDefinition.name}::${columnDefinition.type})`,
			comment: columnDefinition.comment ? ` COMMENT ${escapeString(columnDefinition.comment)}` : '',
		});

		return { statement: externalColumnStatement, isActivated: columnDefinition.isActivated };
	};

	return {
		decorateType,
		getDefault,
		getAutoIncrement,
		getCollation,
		getInlineConstraint,
		createExternalColumn,
	};
};
