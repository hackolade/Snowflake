module.exports = ({ app }) => {
	const { decorateType } = require('./helpers/columnDefinitionHelper')(app);

	return {
		getColumnDataTypeData({ columnDefinition }) {
			return {
				type: decorateType(columnDefinition.type, columnDefinition),
			};
		},
	};
};
