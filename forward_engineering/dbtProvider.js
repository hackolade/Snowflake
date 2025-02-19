/**
 * @typedef {import('./types').AppInstance} AppInstance
 * @typedef {import('./types').ColumnDefinition} ColumnDefinition
 * @typedef {import('./types').CompositeKeyConstraintDto} CompositeKeyConstraintDto
 */
const { toLower } = require('lodash');

const types = require('./configs/types');
const defaultTypes = require('./configs/defaultTypes');
const getKeyHelper = require('./helpers/keyHelper');
const getColumnDefinitionHelper = require('./helpers/columnDefinitionHelper');

class DbtProvider {
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
	 * @returns {DbtProvider}
	 */
	static createDbtProvider({ appInstance }) {
		return new DbtProvider({ appInstance });
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

	/**
	 * @param {{ jsonSchema: Record<string, unknown> }}
	 * @returns {CompositeKeyConstraintDto[]}
	 */
	getCompositeKeyConstraints({ jsonSchema }) {
		const keyHelper = getKeyHelper(this.#appInstance);
		const compositePrimaryKeys = keyHelper.getCompositePrimaryKeys(jsonSchema);
		const compositeUniqueKeys = keyHelper.getCompositeUniqueKeys(jsonSchema);

		return [...compositePrimaryKeys, ...compositeUniqueKeys];
	}
}

module.exports = DbtProvider;
