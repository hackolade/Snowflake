const _ = require('lodash');

const createColumnDefinition = data => ({
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
	...data,
});

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
	}

	return defaultValue;
};

const getLength = jsonSchema => {
	if (_.isNumber(jsonSchema.length)) {
		return jsonSchema.length;
	} else if (_.isNumber(jsonSchema.maxLength)) {
		return jsonSchema.maxLength;
	}

	return '';
};

const getScale = jsonSchema => {
	if (_.isNumber(jsonSchema.scale)) {
		return jsonSchema.scale;
	}

	return '';
};

const getPrecision = jsonSchema => {
	if (_.isNumber(jsonSchema.precision)) {
		return jsonSchema.precision;
	} else if (_.isNumber(jsonSchema.fractSecPrecision)) {
		return jsonSchema.fractSecPrecision;
	}

	return '';
};

const hasMaxLength = jsonSchema => {
	return !!jsonSchema.hasMaxLength;
};

const getType = jsonSchema => {
	if (jsonSchema.$ref) {
		return jsonSchema.$ref.split('/').pop();
	}

	return jsonSchema.mode || jsonSchema.childType || jsonSchema.type;
};

const createColumnDefinitionBySchema = ({ name, jsonSchema, parentJsonSchema, ddlProvider, scriptFormat }) => {
	const columnDefinition = createColumnDefinition({
		name: name,
		type: getType(jsonSchema),
		nullable: isNullable(parentJsonSchema, name),
		default: getDefault({ scriptFormat, type: jsonSchema }),
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

module.exports = {
	createColumnDefinitionBySchema,
};
