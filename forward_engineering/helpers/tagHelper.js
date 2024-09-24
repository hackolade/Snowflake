/**
 * @typedef {import('../types').ObjectTag} ObjectTag
 */

const { differenceBy, some, partition, isEmpty } = require('lodash');
const { preSpace } = require('../utils/preSpace');

module.exports = ({ getName, toString }) => {
	/**
	 * @param {{ tags: ObjectTag[], isCaseSensitive: boolean, indent: string }}
	 * @returns {string}
	 */
	const getTagStatement = ({ tags, isCaseSensitive, indent = ' ' }) => {
		if (isEmptyTags({ tags })) {
			return '';
		}

		const keyValues = getTagKeyValues({ tags, isCaseSensitive });

		if (isEmpty(keyValues)) {
			return '';
		}

		return `${indent}WITH TAG ( ${keyValues} )`;
	};

	/**
	 * @param {{ allowedValues: string[] }}
	 * @returns {string}
	 */
	const getTagAllowedValues = ({ allowedValues = [] }) => {
		const values = allowedValues
			.filter(({ value }) => value)
			.map(({ value }) => toString(value))
			.join(', ');

		return preSpace(!isEmpty(values) && `ALLOWED_VALUES ${values}`);
	};

	/**
	 * @param {{ tags: ObjectTag[], isCaseSensitive: boolean }}
	 * @returns {string}
	 */
	const getTagKeyValues = ({ tags, isCaseSensitive }) => {
		return tags
			.filter(tag => tag.tagName && tag.tagValue)
			.map(tag => `${getTagName({ tagName: tag.tagName, isCaseSensitive })} = ${toString(tag.tagValue)}`)
			.join(', ');
	};

	/**
	 * @param {{ tagName: string, isCaseSensitive: boolean }}
	 * @returns {string}
	 */
	const getTagName = ({ tagName, isCaseSensitive }) => {
		return tagName
			.split('.')
			.map(name => getName(isCaseSensitive || /\s/.test(name), name))
			.join('.');
	};

	/**
	 * @param {{ tags: ObjectTag[], oldTags: ObjectTag[], isCaseSensitive: boolean }}
	 * @returns {string}
	 */
	const getSetTagValue = ({ tags = [], oldTags = [], isCaseSensitive = false }) => {
		const [newTags, restTags] = partition(tags, ({ tagName }) => !some(oldTags, { tagName }));
		const tagsWithNewValues = differenceBy(restTags, oldTags, ({ tagName, tagValue }) => tagName && tagValue);

		if (isEmpty(newTags) && isEmpty(tagsWithNewValues)) {
			return '';
		}

		const tagKeyValues = getTagKeyValues({ tags: [...newTags, ...tagsWithNewValues], isCaseSensitive });

		return `TAG ${tagKeyValues}`;
	};

	/**
	 * @param {{ tags: ObjectTag[], oldTags: ObjectTag[], isCaseSensitive: boolean }}
	 * @returns {string}
	 */
	const getUnsetTagValue = ({ tags = [], oldTags = [], isCaseSensitive = false }) => {
		const [droppedTags] = partition(oldTags, ({ tagName }) => !some(tags, { tagName }));

		if (isEmpty(droppedTags)) {
			return '';
		}

		const tagNames = droppedTags.map(({ tagName }) => getTagName({ tagName, isCaseSensitive })).join(', ');

		return `TAG ${tagNames}`;
	};

	/**
	 * @typedef {{ collection: object, data: object }} AlterData
	 * @param {'schemaTags' | 'tableTags' | 'viewTags' | 'columnTags'} tagPropertyKeyword
	 * @returns {({ collection, data }: AlterData) => AlterData}
	 */
	const prepareObjectTagsData =
		tagPropertyKeyword =>
		({ collection, data }) => {
			const isCaseSensitive = collection?.role?.isCaseSensitive;
			const compMode = collection?.role?.compMod?.[tagPropertyKeyword] ?? {};
			const { new: tags, old: oldTags } = compMode;
			const tagsToSet = getSetTagValue({ tags, oldTags, isCaseSensitive });
			const tagsToUnset = getUnsetTagValue({ tags, oldTags, isCaseSensitive });

			return {
				collection,
				data: {
					...data,
					tags: {
						tagsToSet,
						tagsToUnset,
					},
				},
			};
		};

	/**
	 * @param {{ tags: ObjectTag[] }}
	 * @returns {boolean}
	 */
	const isEmptyTags = ({ tags }) => {
		return isEmpty(tags) || tags.every(tag => !tag.tagName);
	};

	return {
		getTagStatement,
		getTagAllowedValues,
		getTagKeyValues,
		prepareObjectTagsData,
		getSetTagValue,
		getUnsetTagValue,
		isEmptyTags,
	};
};
