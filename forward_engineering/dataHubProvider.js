/**
 * @typedef {import('./types').AppInstance} AppInstance
 * @typedef {import('./types').ColumnDefinition} ColumnDefinition
 * @typedef {import('./types').ConstraintDto} ConstraintDto
 * @typedef {import('./types').JsonSchema} JsonSchema
 */
const { toLower } = require('lodash');

const types = require('./configs/types');
const defaultTypes = require('./configs/defaultTypes');
const getColumnDefinitionHelper = require('./helpers/columnDefinitionHelper');
const { createView, hydrateView, hydrateViewColumn } = require('./helpers/viewHelper');
const { FORMATS } = require('./helpers/constants');
const { hydrateJsonSchemaColumn } = require('./helpers/hydrateJsonSchema');

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

		if (['VARCHAR', 'STRING', 'TEXT'].includes(type) && !columnDefinition.length) {
			columnDefinition.length = 16777216;
		} else if (['CHAR', 'CHARACTER'].includes(type) && !columnDefinition.length) {
			columnDefinition.length = 1;
		}

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

	hydrateJsonSchemaColumn(jsonSchema, definitionJsonSchema) {
		return hydrateJsonSchemaColumn(jsonSchema, definitionJsonSchema);
	}

	getPlatformSchema() {
		return {
			'com.linkedin.schema.MySqlDDL': {
				tableSchema: '',
			},
		};
	}

	getTags({ data, containerAssets, options }) {
		if (options.exportTags === 'skip') {
			return [];
		}

		return data.containers
			.flatMap(container => {
				const containerObject = this.#mergeTabs(container.containerData);
				const containerAsset = containerAssets.find(asset => asset.hackoladeMeta?.bucketId === container.id);

				if (!containerAsset) {
					throw new Error(
						`The the container asset for the "${containerObject.code ?? containerObject.name}" is not found!`,
					);
				}

				if (!containerAsset.hackoladeMeta) {
					throw new Error(
						`The "database" and "schema" of the container asset "${containerAsset.containerProperties.value.name}" are not found!`,
					);
				}

				return (containerObject.tags ?? [])?.flatMap(tag => {
					return (tag.allowedValues ?? []).map(tagValue => {
						return {
							displayName: `${tag.name}: ${tagValue.value}`,
							name: `${containerAsset.hackoladeMeta?.database}.${containerAsset.hackoladeMeta?.schema}.${tag.name}:${tagValue.value}`,
							resolutionData: {
								tagName: tag.id,
								tagValue: tagValue.id,
							},
						};
					});
				});
			})
			.filter(Boolean);
	}

	#mergeTabs(tabsData) {
		return tabsData.reduce((acc, current) => Object.assign(acc, current), {});
	}
}

module.exports = DataHubProvider;
