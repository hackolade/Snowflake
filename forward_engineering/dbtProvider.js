/**
 * @typedef {import('./types').ColumnDefinition} ColumnDefinition
 */

module.exports = ({ app }) => {
	const { decorateType } = require('./helpers/columnDefinitionHelper')(app);

	return {
		/**
		 * @param {{ columnDefinition: ColumnDefinition; }}
		 * @returns {{ type: string; }}
		 */
		getColumnDataTypeData({ columnDefinition }) {
			return {
				type: decorateType(columnDefinition.type, columnDefinition),
			};
		},
	};
};
