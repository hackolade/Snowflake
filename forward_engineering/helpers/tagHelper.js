const { differenceBy, some, partition } = require('lodash');
/**
 * @typedef {{ id: string, tagName?: string, tagValue?: string }} Tag
 */

const { isEmpty } = require('lodash');

module.exports = ({ getName, toString }) => {
	/**
	 * @param {{ tags: Tag[], isCaseSensitive: boolean, indent: string }}
	 * @returns {string}
	 */
	const getTagStatement = ({ tags, isCaseSensitive, indent = ' ' }) => {
		if (isEmpty(tags)) {
			return '';
		}

		const keyValues = getTagKeyValues({ tags, isCaseSensitive });

		return `${indent}WITH TAG ( ${keyValues} )`;
	};

	/**
	 * @param {{ allowedValues: string[] }}
	 * @returns {string}
	 */
	const getTagAllowedValues = ({ allowedValues }) => {
		if (isEmpty(allowedValues)) {
			return '';
		}

		const values = allowedValues.map(({ value }) => toString(value)).join(', ');

		return ` ALLOWED_VALUES ${values}`;
	};

	/**
	 * @param {{ tags: Tag[], isCaseSensitive: boolean }}
	 * @returns {string}
	 */
	const getTagKeyValues = ({ tags, isCaseSensitive }) => {
		return tags
			.filter(tag => tag.tagName)
			.map(tag => `${getTagName({ tagName: tag.tagName, isCaseSensitive })} = ${toString(tag.tagValue)}`)
			.join(', ');
	};

	/**
	 * @param {{ tagName: string, isCaseSensitive: boolean }}
	 * @returns {string}
	 */
	const getTagName = ({ tagName, isCaseSensitive }) => {
		const hasSpace = /\s/.test(tagName);

		if (!hasSpace) {
			return tagName;
		}

		return tagName
			.split('.')
			.map(name => getName(isCaseSensitive, name))
			.join('.');
	};

	/**
	 * @param {{ tags: Tag[], oldTags: Tag[], isCaseSensitive: boolean }}
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
	 * @param {{tags: Tag[], oldTags: Tag[], isCaseSensitive: boolean }}
	 * @returns {string}
	 */
	const getUnsetTagValue = ({ tags = [], oldTags = [], isCaseSensitive = false }) => {
		const [droppedTags] = partition(oldTags, ({ tagName }) => !some(tags, { tagName }));

		if (isEmpty(droppedTags)) {
			return '';
		}

		const tagNames = droppedTags.map(({ tagName }) => tagName).join(', ');

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
			const set = getSetTagValue({ tags, oldTags, isCaseSensitive });
			const unset = getUnsetTagValue({ tags, oldTags, isCaseSensitive });

			return {
				collection,
				data: {
					...data,
					tags: {
						set,
						unset,
					},
				},
			};
		};

	return {
		getTagStatement,
		getTagAllowedValues,
		getTagKeyValues,
		prepareObjectTagsData,
	};
};
