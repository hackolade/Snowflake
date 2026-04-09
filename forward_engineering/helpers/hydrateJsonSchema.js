const { omit } = require('lodash');

const hydrateJsonSchemaColumn = (jsonSchema, definitionJsonSchema) => {
	if (jsonSchema.type === 'variant') {
		return omit(jsonSchema, ['subtype', 'mode']);
	}

	return jsonSchema;
};

module.exports = { hydrateJsonSchemaColumn };
