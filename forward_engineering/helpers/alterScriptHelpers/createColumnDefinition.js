/*
 * Copyright © 2016-2023 by IntegrIT S.A. dba Hackolade.  All rights reserved.
 *
 * The copyright to the computer software herein is the property of IntegrIT S.A.
 * The software may be used and/or copied only with the written permission of
 * IntegrIT S.A. or in accordance with the terms and conditions stipulated in
 * the agreement/contract under which the software has been supplied.
 */

module.exports = _ => {
	const createColumnDefinition = data => {
		return Object.assign(
			{
				name: '',
				type: '',
				nullable: true,
				primaryKey: false,
				default: '',
				length: '',
				scale: '',
				precision: '',
				hasMaxLength: false,
				expression: '',
			},
			data,
		);
	};

	const isNullable = (parentSchema, propertyName) => {
		if (!Array.isArray(parentSchema.required)) {
			return true;
		}

		return !parentSchema.required.includes(propertyName);
	};

	const getDefault = jsonSchema => {
		const defaultValue = jsonSchema.default;

		if (_.isBoolean(defaultValue)) {
			return defaultValue;
		} else if (jsonSchema.default === null) {
			return 'NULL';
		} else {
			return defaultValue;
		}
	};

	const getLength = jsonSchema => {
		if (_.isNumber(jsonSchema.length)) {
			return jsonSchema.length;
		} else if (_.isNumber(jsonSchema.maxLength)) {
			return jsonSchema.maxLength;
		} else {
			return '';
		}
	};

	const getScale = jsonSchema => {
		if (_.isNumber(jsonSchema.scale)) {
			return jsonSchema.scale;
		} else {
			return '';
		}
	};

	const getPrecision = jsonSchema => {
		if (_.isNumber(jsonSchema.precision)) {
			return jsonSchema.precision;
		} else if (_.isNumber(jsonSchema.fractSecPrecision)) {
			return jsonSchema.fractSecPrecision;
		} else {
			return '';
		}
	};

	const hasMaxLength = jsonSchema => {
		if (jsonSchema.hasMaxLength) {
			return jsonSchema.hasMaxLength;
		} else {
			return '';
		}
	};

	const getType = jsonSchema => {
		if (jsonSchema.$ref) {
			return jsonSchema.$ref.split('/').pop();
		}

		return jsonSchema.mode || jsonSchema.childType || jsonSchema.type;
	};

	const createColumnDefinitionBySchema = ({ name, jsonSchema, parentJsonSchema, ddlProvider }) => {
		const columnDefinition = createColumnDefinition({
			name: name,
			type: getType(jsonSchema),
			nullable: isNullable(parentJsonSchema, name),
			default: getDefault(jsonSchema),
			primaryKey: jsonSchema.primaryKey,
			length: getLength(jsonSchema),
			scale: getScale(jsonSchema),
			precision: getPrecision(jsonSchema),
			hasMaxLength: hasMaxLength(jsonSchema),
			isActivated: jsonSchema.isActivated,
			expression: jsonSchema.expression,
		});

		return ddlProvider.hydrateColumn({
			columnDefinition,
			jsonSchema,
		});
	};

	return {
		createColumnDefinitionBySchema,
	};
};
