/**
 * @typedef {import('./types').AppInstance} AppInstance
 * @typedef {import('./types').ColumnDefinition} ColumnDefinition
 * @typedef {import('./types').ConstraintDto} ConstraintDto
 * @typedef {import('./types').JsonSchema} JsonSchema
 */
const { toLower } = require('lodash');

const types = require('./configs/types');
const defaultTypes = require('./configs/defaultTypes');
const getKeyHelper = require('./helpers/keyHelper');
const getColumnDefinitionHelper = require('./helpers/columnDefinitionHelper');
const { createView, hydrateView, hydrateViewColumn } = require('./helpers/viewHelper');
const { FORMATS } = require('./helpers/constants');

class DataHubProvider {
	/**
	 * @type {AppInstance}
	 */
	#appInstance;

	/**
	 * @param {{ appInstance: AppInstance }}
	 */
	constructor({ appInstance }) {
		this.#appInstance = appInstance;
	}

	/**
	 * @param {{ appInstance }}
	 * @returns {DataHubProvider}
	 */
	static createDataHubProvider({ appInstance }) {
		return new DataHubProvider({ appInstance });
	}

	/**
	 * @param {string} type
	 * @returns {string | undefined}
	 */
	getDefaultType(type) {
		return defaultTypes[type];
	}

	/**
	 * @returns {Record<string, object>}
	 */
	getTypesDescriptors() {
		return types;
	}

	/**
	 * @param {string} type
	 * @returns {boolean}
	 */
	hasType(type) {
		return Object.keys(types).map(toLower).includes(toLower(type));
	}

	/**
	 * @param {{ columnDefinition: ColumnDefinition; }}
	 * @returns {{ type: string; }}
	 */
	decorateType({ type, columnDefinition }) {
		const columnDefinitionHelper = getColumnDefinitionHelper(this.#appInstance);

		return columnDefinitionHelper.decorateType(type, columnDefinition);
	}

	createView(viewData, dbData, isActivated) {
		const { getViewSelectStatement } = require('./helpers/tableHelper')(this.#appInstance);
		const keyHelper = require('./helpers/keyHelper')(this.#appInstance);

		return createView({
			viewData,
			isActivated,
			scriptFormat: FORMATS.SNOWSIGHT,
			getViewSelectStatement,
			keyHelper,
		});
	}

	hydrateView({ viewData, entityData }) {
		return hydrateView({ viewData, entityData });
	}

	hydrateViewColumn(data) {
		return hydrateViewColumn(data);
	}

	getPlatformSchema() {
		return {
			'com.linkedin.schema.MySqlDDL': {
				tableSchema: '',
			},
		};
	}
}

module.exports = DataHubProvider;
